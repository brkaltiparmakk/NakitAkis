"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { categorize } from "@/lib/categorize";
import { getRules, runTransferMatching } from "@/lib/data";
import { foldTr } from "@/lib/import/normalize";
import { optStr, str } from "./util";

async function ownCategory(userId: string, id: string | null) {
  if (!id) return null;
  const [c] = await db()
    .select({ id: schema.categories.id })
    .from(schema.categories)
    .where(and(eq(schema.categories.id, id), eq(schema.categories.userId, userId)));
  return c?.id ?? null;
}

// İşlemler sayfasında seçilen birden çok işleme aynı kategoriyi atar ("" = kategorisiz yap)
export async function bulkSetCategory(f: FormData) {
  const user = await requireUser();
  const ids = f
    .getAll("ids")
    .map(String)
    .filter((id) => /^[0-9a-f-]{36}$/i.test(id))
    .slice(0, 1000);
  if (!ids.length) return;
  const categoryId = await ownCategory(user.id, optStr(f, "categoryId"));
  await db()
    .update(schema.transactions)
    .set({ categoryId })
    .where(and(eq(schema.transactions.userId, user.id), inArray(schema.transactions.id, ids)));
  revalidatePath("/", "layout");
}

// İşlemin kategorisini değiştirir. "learn" işaretliyse anahtar kelime kural olarak kaydedilir ve
// aynı kelimeyi içeren kategorisiz işlemlere de uygulanır.
export async function setTransactionCategory(f: FormData) {
  const user = await requireUser();
  const categoryId = await ownCategory(user.id, optStr(f, "categoryId"));
  const txId = str(f, "id");
  await db()
    .update(schema.transactions)
    .set({ categoryId })
    .where(and(eq(schema.transactions.id, txId), eq(schema.transactions.userId, user.id)));

  const pattern = foldTr(str(f, "pattern"));
  if (categoryId && f.get("learn") && pattern.length >= 3) {
    await db()
      .insert(schema.categoryRules)
      .values({ userId: user.id, pattern, categoryId, source: "user" })
      .onConflictDoUpdate({ target: [schema.categoryRules.userId, schema.categoryRules.pattern], set: { categoryId } });
    await applyRulesToUncategorized(user.id);
  }
  revalidatePath("/", "layout");
}

async function applyRulesToUncategorized(userId: string) {
  const rules = await getRules(userId);
  const rows = await db()
    .select({ id: schema.transactions.id, description: schema.transactions.description })
    .from(schema.transactions)
    .where(and(eq(schema.transactions.userId, userId), isNull(schema.transactions.categoryId)));
  const byCat = new Map<string, string[]>();
  for (const r of rows) {
    const c = categorize(r.description, rules);
    if (c) byCat.set(c, [...(byCat.get(c) ?? []), r.id]);
  }
  for (const [categoryId, ids] of byCat) {
    for (let i = 0; i < ids.length; i += 500) {
      const part = ids.slice(i, i + 500);
      await db().update(schema.transactions).set({ categoryId }).where(and(eq(schema.transactions.userId, userId), inArray(schema.transactions.id, part)));
    }
  }
  return rows.length;
}

export async function reapplyRules() {
  const user = await requireUser();
  await applyRulesToUncategorized(user.id);
  revalidatePath("/", "layout");
}

export async function addRule(f: FormData) {
  const user = await requireUser();
  const categoryId = await ownCategory(user.id, optStr(f, "categoryId"));
  const pattern = foldTr(str(f, "pattern"));
  if (!categoryId || pattern.length < 2) return;
  await db()
    .insert(schema.categoryRules)
    .values({ userId: user.id, pattern, categoryId, source: "user" })
    .onConflictDoUpdate({ target: [schema.categoryRules.userId, schema.categoryRules.pattern], set: { categoryId } });
  await applyRulesToUncategorized(user.id);
  revalidatePath("/", "layout");
}

export async function deleteRule(f: FormData) {
  const user = await requireUser();
  await db()
    .delete(schema.categoryRules)
    .where(and(eq(schema.categoryRules.id, str(f, "id")), eq(schema.categoryRules.userId, user.id)));
  revalidatePath("/", "layout");
}

export async function addCategory(f: FormData) {
  const user = await requireUser();
  const name = str(f, "name");
  const kind = ["income", "expense", "transfer"].includes(str(f, "kind")) ? str(f, "kind") : "expense";
  if (!name) return;
  await db()
    .insert(schema.categories)
    .values({ userId: user.id, name, kind, color: str(f, "color") || "#64748b" })
    .onConflictDoNothing();
  revalidatePath("/", "layout");
}

export async function deleteTransaction(f: FormData) {
  const user = await requireUser();
  await db()
    .delete(schema.transactions)
    .where(and(eq(schema.transactions.id, str(f, "id")), eq(schema.transactions.userId, user.id)));
  revalidatePath("/", "layout");
}

export async function matchTransfers() {
  const user = await requireUser();
  await runTransferMatching(user.id);
  revalidatePath("/", "layout");
}
