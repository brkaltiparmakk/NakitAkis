"use server";

import { and, count, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { categorize, categoryFromBankLabel, holderPattern } from "@/lib/categorize";
import { getCategories, getRules, runTransferMatching } from "@/lib/data";
import { planInserts } from "@/lib/import/dedupe";
import { dedupeKey } from "@/lib/import/normalize";
import { readImportFile } from "@/lib/import/readFile";
import type { ImportPreview } from "@/lib/import/types";

const MAX_BYTES = 4 * 1024 * 1024;

async function ownAccount(userId: string, accountId: string) {
  const [acc] = await db()
    .select()
    .from(schema.accounts)
    .where(and(eq(schema.accounts.id, accountId), eq(schema.accounts.userId, userId)));
  return acc;
}

export async function previewImport(f: FormData): Promise<{ preview?: ImportPreview; error?: string }> {
  const user = await requireUser();
  const acc = await ownAccount(user.id, String(f.get("accountId") ?? ""));
  if (!acc) return { error: "Önce bir hesap seçin." };
  const file = f.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Dosya seçin." };
  if (file.size > MAX_BYTES) return { error: "Dosya 4 MB'tan büyük olamaz." };
  try {
    const preview = await readImportFile(file.name, new Uint8Array(await file.arrayBuffer()), acc.type === "credit_card");
    // Hesap için daha önce kaydedilmiş sütun eşlemesi varsa onu öner
    if (preview.kind === "table" && acc.columnMapping) {
      const saved = acc.columnMapping;
      if (preview.rows[saved.headerRow] && preview.rows[saved.headerRow].length > Math.max(saved.date, saved.description)) {
        preview.mapping = saved;
      }
    }
    // Tarayıcıya gereğinden büyük veri gönderme
    if (preview.kind === "table") preview.rows = preview.rows.slice(0, 5000);
    return { preview };
  } catch (e) {
    console.error("import preview failed", e);
    return { error: "Dosya okunamadı. Şifreli PDF ya da desteklenmeyen bir biçim olabilir." };
  }
}

const commitSchema = z.object({
  accountId: z.string().uuid(),
  fileName: z.string().max(300),
  transactions: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        description: z.string().max(500),
        amount: z.number().finite(),
        installmentNo: z.number().int().nullable(),
        installmentTotal: z.number().int().nullable(),
        label: z.string().max(100).nullable().optional(),
      }),
    )
    .max(10000),
  balanceAnchor: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), amount: z.number().finite() }).nullable(),
  mapping: z
    .object({
      headerRow: z.number().int(),
      date: z.number().int(),
      description: z.number().int(),
      amount: z.number().int().optional(),
      debit: z.number().int().optional(),
      credit: z.number().int().optional(),
      balance: z.number().int().optional(),
      label: z.number().int().optional(),
      invertSign: z.boolean(),
    })
    .nullable(),
  statement: z
    .object({
      statementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      totalDue: z.number().finite(),
      minDue: z.number().finite(),
    })
    .nullable(),
  holderName: z.string().max(120).nullable().optional(),
});

export type CommitInput = z.infer<typeof commitSchema>;
export type CommitResult =
  | { inserted: number; skipped: number; categorized: number; transfersMatched: number; balanceUpdated: boolean; statementSaved: boolean }
  | { error: string };

function chunks<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export async function commitImport(input: CommitInput): Promise<CommitResult> {
  const user = await requireUser();
  const parsed = commitSchema.safeParse(input);
  if (!parsed.success) return { error: "Geçersiz veri." };
  const data = parsed.data;
  const acc = await ownAccount(user.id, data.accountId);
  if (!acc) return { error: "Hesap bulunamadı." };

  const rows = data.transactions.map((t) => ({ ...t, key: dedupeKey(t.date, t.amount, t.description) }));
  const keys = [...new Set(rows.map((r) => r.key))];
  const existing = new Map<string, number>();
  for (const part of chunks(keys, 500)) {
    const found = await db()
      .select({ key: schema.transactions.dedupeKey, n: count() })
      .from(schema.transactions)
      .where(and(eq(schema.transactions.accountId, acc.id), inArray(schema.transactions.dedupeKey, part)))
      .groupBy(schema.transactions.dedupeKey);
    for (const r of found) existing.set(r.key, r.n);
  }
  const { toInsert, skipped } = planInserts(rows, existing);

  const [imp] = await db()
    .insert(schema.imports)
    .values({
      userId: user.id,
      accountId: acc.id,
      fileName: data.fileName,
      rowCount: rows.length,
      insertedCount: toInsert.length,
      skippedCount: skipped,
    })
    .returning({ id: schema.imports.id });

  // Dökümdeki hesap sahibinin adı geçen işlemler kendi hesaplarınız arası transferdir (ör. FAST ...-AD SOYAD-)
  const categories = await getCategories(user.id);
  const catByName = new Map(categories.map((c) => [c.name, c.id]));
  const transferCat = catByName.get("Hesaplar Arası Transfer");
  const holder = data.holderName ? holderPattern(data.holderName) : null;
  if (transferCat && holder) {
    await db()
      .insert(schema.categoryRules)
      .values({ userId: user.id, pattern: holder, categoryId: transferCat, source: "auto" })
      .onConflictDoNothing();
  }

  const rules = await getRules(user.id);
  let categorized = 0;
  const values = toInsert.map((t) => {
    // Önce kurallar, eşleşmezse bankanın kendi etiketi
    const fromLabel = categoryFromBankLabel(t.label);
    const categoryId = categorize(t.description, rules) ?? (fromLabel ? (catByName.get(fromLabel) ?? null) : null);
    if (categoryId) categorized++;
    return {
      userId: user.id,
      accountId: acc.id,
      date: t.date,
      description: t.description,
      amount: t.amount.toFixed(2),
      categoryId,
      installmentNo: t.installmentNo,
      installmentTotal: t.installmentTotal,
      dedupeKey: t.key,
      importId: imp.id,
    };
  });
  for (const part of chunks(values, 500)) await db().insert(schema.transactions).values(part);

  // Dökümdeki bakiye, mevcut çapadan daha yeniyse hesabın bakiyesi olarak alınır
  let balanceUpdated = false;
  if (data.balanceAnchor && (!acc.balanceDate || data.balanceAnchor.date >= acc.balanceDate)) {
    await db()
      .update(schema.accounts)
      .set({ balanceAmount: data.balanceAnchor.amount.toFixed(2), balanceDate: data.balanceAnchor.date, balanceSource: "statement" })
      .where(eq(schema.accounts.id, acc.id));
    balanceUpdated = true;
  }
  if (data.mapping) {
    await db().update(schema.accounts).set({ columnMapping: data.mapping }).where(eq(schema.accounts.id, acc.id));
  }
  let statementSaved = false;
  if (data.statement && acc.type === "credit_card") {
    const s = data.statement;
    await db()
      .insert(schema.cardStatements)
      .values({ userId: user.id, accountId: acc.id, importId: imp.id, statementDate: s.statementDate, dueDate: s.dueDate, totalDue: s.totalDue.toFixed(2), minDue: s.minDue.toFixed(2) })
      .onConflictDoUpdate({
        target: [schema.cardStatements.accountId, schema.cardStatements.statementDate],
        set: { dueDate: s.dueDate, totalDue: s.totalDue.toFixed(2), minDue: s.minDue.toFixed(2) },
      });
    statementSaved = true;
  }

  // Diğer vadesiz hesaplardaki karşılığıyla eşleşen havaleler iç transfer olarak işaretlenir
  const transfersMatched = acc.type === "checking" ? await runTransferMatching(user.id) : 0;

  revalidatePath("/", "layout");
  return { inserted: toInsert.length, skipped, categorized, transfersMatched, balanceUpdated, statementSaved };
}

export async function deleteImport(f: FormData) {
  const user = await requireUser();
  await db()
    .delete(schema.imports)
    .where(and(eq(schema.imports.id, String(f.get("id"))), eq(schema.imports.userId, user.id)));
  revalidatePath("/", "layout");
}
