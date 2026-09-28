"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { todayIso } from "@/lib/dates";
import { int, isoDate, money, optStr, percent, str } from "./util";

const BANKS = ["garanti", "isbank", "yapikredi", "akbank", "diger"];

function fields(f: FormData) {
  const type = str(f, "type") === "credit_card" ? "credit_card" : "checking";
  const bank = BANKS.includes(str(f, "bank")) ? str(f, "bank") : "diger";
  const base = { name: str(f, "name") || "Hesap", bank, type };
  if (type === "checking") {
    return {
      ...base,
      kmhLimit: money(f, "kmhLimit"),
      kmhMonthlyRate: percent(f, "kmhMonthlyRate"),
      expectedMonthlySpend: money(f, "expectedMonthlySpend"),
    };
  }
  return {
    ...base,
    cardLimit: money(f, "cardLimit"),
    statementDay: int(f, "statementDay", 1, 31),
    dueDay: int(f, "dueDay", 1, 31),
    minPaymentRate: percent(f, "minPaymentRate") ?? "0.20000",
    cardMonthlyRate: percent(f, "cardMonthlyRate"),
    paymentMode: str(f, "paymentMode") === "full" ? "full" : "minimum",
    expectedMonthlySpend: money(f, "expectedMonthlySpend"),
    payFromAccountId: optStr(f, "payFromAccountId"),
  };
}

export async function saveAccount(f: FormData) {
  const user = await requireUser();
  const id = optStr(f, "id");
  const values = fields(f);
  if (id) {
    await db()
      .update(schema.accounts)
      .set(values)
      .where(and(eq(schema.accounts.id, id), eq(schema.accounts.userId, user.id)));
  } else {
    await db().insert(schema.accounts).values({ ...values, userId: user.id });
  }
  revalidatePath("/", "layout");
}

// Elle bakiye girişi: seçilen günün sonundaki bakiye (varsayılan bugün)
export async function setBalance(f: FormData) {
  const user = await requireUser();
  const amount = money(f, "balance");
  if (amount === null) return;
  await db()
    .update(schema.accounts)
    .set({ balanceAmount: amount, balanceDate: isoDate(f, "balanceDate") ?? todayIso(), balanceSource: "manual" })
    .where(and(eq(schema.accounts.id, str(f, "id")), eq(schema.accounts.userId, user.id)));
  revalidatePath("/", "layout");
}

export async function archiveAccount(f: FormData) {
  const user = await requireUser();
  await db()
    .update(schema.accounts)
    .set({ archived: true })
    .where(and(eq(schema.accounts.id, str(f, "id")), eq(schema.accounts.userId, user.id)));
  revalidatePath("/", "layout");
}

export async function saveStatement(f: FormData) {
  const user = await requireUser();
  const accountId = str(f, "accountId");
  const [acc] = await db()
    .select({ id: schema.accounts.id })
    .from(schema.accounts)
    .where(and(eq(schema.accounts.id, accountId), eq(schema.accounts.userId, user.id)));
  const statementDate = isoDate(f, "statementDate");
  const dueDate = isoDate(f, "dueDate");
  const totalDue = money(f, "totalDue");
  const minDue = money(f, "minDue");
  if (!acc || !statementDate || !dueDate || totalDue === null || minDue === null) return;
  await db()
    .insert(schema.cardStatements)
    .values({ userId: user.id, accountId, statementDate, dueDate, totalDue, minDue })
    .onConflictDoUpdate({
      target: [schema.cardStatements.accountId, schema.cardStatements.statementDate],
      set: { dueDate, totalDue, minDue },
    });
  revalidatePath("/", "layout");
}

export async function deleteStatement(f: FormData) {
  const user = await requireUser();
  await db()
    .delete(schema.cardStatements)
    .where(and(eq(schema.cardStatements.id, str(f, "id")), eq(schema.cardStatements.userId, user.id)));
  revalidatePath("/", "layout");
}
