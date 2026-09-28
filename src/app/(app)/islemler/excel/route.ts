import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getCategories } from "@/lib/data";
import { xlsxResponse } from "@/lib/excel";
import { toNum } from "@/lib/money";
import { transactionFilters } from "@/lib/transactionFilters";

export async function GET(req: NextRequest) {
  const user = await requireUser();
  const categories = await getCategories(user.id);
  const transferCategoryIds = categories.filter((c) => c.kind === "transfer").map((c) => c.id);
  const { where, orderBy } = transactionFilters(user.id, Object.fromEntries(req.nextUrl.searchParams), { transferCategoryIds });
  const list = await db()
    .select({
      date: schema.transactions.date,
      account: schema.accounts.name,
      description: schema.transactions.description,
      category: schema.categories.name,
      installmentNo: schema.transactions.installmentNo,
      installmentTotal: schema.transactions.installmentTotal,
      amount: schema.transactions.amount,
    })
    .from(schema.transactions)
    .innerJoin(schema.accounts, eq(schema.accounts.id, schema.transactions.accountId))
    .leftJoin(schema.categories, eq(schema.categories.id, schema.transactions.categoryId))
    .where(and(...where))
    .orderBy(...orderBy)
    .limit(20000);

  const rows: (string | number | null)[][] = [
    ["Tarih", "Hesap", "Açıklama", "Kategori", "Taksit", "Tutar"],
    ...list.map((t) => [
      `${t.date.slice(8, 10)}.${t.date.slice(5, 7)}.${t.date.slice(0, 4)}`,
      t.account,
      t.description,
      t.category ?? "Kategorisiz",
      t.installmentNo ? `${t.installmentNo}/${t.installmentTotal}` : null,
      toNum(t.amount),
    ]),
  ];
  return xlsxResponse("islemler.xlsx", "İşlemler", rows, [12, 22, 60, 24, 8, 14]);
}
