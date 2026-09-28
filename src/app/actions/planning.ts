"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { todayIso } from "@/lib/dates";
import { int, isoDate, money, optStr, str } from "./util";

export async function saveRecurring(f: FormData) {
  const user = await requireUser();
  // "12 ay ortalaması" seçiliyse tutar kategorinin geçmişinden hesaplanır; girilen tutar yalnızca yedek değerdir
  const autoAverage = f.get("autoAverage") === "on" && !!optStr(f, "categoryId");
  const amount = money(f, "amount") ?? (autoAverage ? "0" : null);
  if (amount === null) return;
  const frequency = ["monthly", "weekly", "yearly"].includes(str(f, "frequency")) ? str(f, "frequency") : "monthly";
  const values = {
    name: str(f, "name") || "Düzenli kalem",
    amount: Math.abs(Number(amount)).toFixed(2),
    direction: str(f, "direction") === "in" ? "in" : "out",
    frequency,
    dayOfMonth: int(f, "dayOfMonth", 1, 31),
    dayOfWeek: int(f, "dayOfWeek", 1, 7),
    monthOfYear: int(f, "monthOfYear", 1, 12),
    startDate: isoDate(f, "startDate") ?? todayIso(),
    endDate: isoDate(f, "endDate"),
    accountId: optStr(f, "accountId"),
    categoryId: optStr(f, "categoryId"),
    autoAverage,
  };
  const id = optStr(f, "id");
  if (id) {
    await db()
      .update(schema.recurringItems)
      .set(values)
      .where(and(eq(schema.recurringItems.id, id), eq(schema.recurringItems.userId, user.id)));
  } else {
    await db().insert(schema.recurringItems).values({ ...values, userId: user.id });
  }
  revalidatePath("/", "layout");
}

export async function deleteRecurring(f: FormData) {
  const user = await requireUser();
  await db()
    .delete(schema.recurringItems)
    .where(and(eq(schema.recurringItems.id, str(f, "id")), eq(schema.recurringItems.userId, user.id)));
  revalidatePath("/", "layout");
}

export async function saveLoan(f: FormData) {
  const user = await requireUser();
  const installmentAmount = money(f, "installmentAmount");
  const nextPaymentDate = isoDate(f, "nextPaymentDate");
  const remainingInstallments = int(f, "remainingInstallments", 0, 600);
  if (installmentAmount === null || !nextPaymentDate || remainingInstallments === null) return;
  const values = {
    name: str(f, "name") || "Kredi",
    kind: str(f, "kind") || "konut",
    installmentAmount: Math.abs(Number(installmentAmount)).toFixed(2),
    nextPaymentDate,
    remainingInstallments,
    accountId: optStr(f, "accountId"),
    note: optStr(f, "note"),
  };
  const id = optStr(f, "id");
  if (id) {
    await db()
      .update(schema.loans)
      .set(values)
      .where(and(eq(schema.loans.id, id), eq(schema.loans.userId, user.id)));
  } else {
    await db().insert(schema.loans).values({ ...values, userId: user.id });
  }
  revalidatePath("/", "layout");
}

export async function deleteLoan(f: FormData) {
  const user = await requireUser();
  await db()
    .delete(schema.loans)
    .where(and(eq(schema.loans.id, str(f, "id")), eq(schema.loans.userId, user.id)));
  revalidatePath("/", "layout");
}

export async function saveReceivable(f: FormData) {
  const user = await requireUser();
  // "12 ay ortalaması" seçiliyse tutar kategorinin geçmişinden hesaplanır; girilen tutar yalnızca yedek değerdir
  const autoAverage = f.get("autoAverage") === "on" && !!optStr(f, "categoryId");
  const amount = money(f, "amount") ?? (autoAverage ? "0" : null);
  if (amount === null) return;
  const values = {
    name: str(f, "name") || "Alacak",
    direction: str(f, "direction") === "out" ? "out" : "in",
    amount: Math.abs(Number(amount)).toFixed(2),
    expectedDate: isoDate(f, "expectedDate"),
    accountId: optStr(f, "accountId"),
    note: optStr(f, "note"),
  };
  const id = optStr(f, "id");
  if (id) {
    await db()
      .update(schema.receivables)
      .set(values)
      .where(and(eq(schema.receivables.id, id), eq(schema.receivables.userId, user.id)));
  } else {
    await db().insert(schema.receivables).values({ ...values, userId: user.id });
  }
  revalidatePath("/", "layout");
}

// "Geldi / ödendi": para zaten banka dökümüyle gireceği için kayıt beklenenlerden çıkarılır
export async function settleReceivable(f: FormData) {
  const user = await requireUser();
  await db()
    .update(schema.receivables)
    .set({ settled: true })
    .where(and(eq(schema.receivables.id, str(f, "id")), eq(schema.receivables.userId, user.id)));
  revalidatePath("/", "layout");
}

export async function deleteReceivable(f: FormData) {
  const user = await requireUser();
  await db()
    .delete(schema.receivables)
    .where(and(eq(schema.receivables.id, str(f, "id")), eq(schema.receivables.userId, user.id)));
  revalidatePath("/", "layout");
}
