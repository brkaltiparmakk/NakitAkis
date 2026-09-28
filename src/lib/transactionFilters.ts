import { eq, gte, ilike, isNull, lte, type SQL } from "drizzle-orm";
import { schema } from "@/db";
import { parseDate } from "@/lib/import/normalize";

const isUuid = (v?: string) => !!v && /^[0-9a-f-]{36}$/i.test(v);

// İşlemler sayfası ve Excel çıktısı için ortak filtreler (hesap, kategori, tarih aralığı, açıklama)
export function transactionFilters(userId: string, sp: Record<string, string | undefined>) {
  const where: SQL[] = [eq(schema.transactions.userId, userId)];
  if (isUuid(sp.hesap)) where.push(eq(schema.transactions.accountId, sp.hesap!));
  if (sp.kategori === "yok") where.push(isNull(schema.transactions.categoryId));
  else if (isUuid(sp.kategori)) where.push(eq(schema.transactions.categoryId, sp.kategori!));
  const from = parseDate(sp.baslangic ?? null);
  const to = parseDate(sp.bitis ?? null);
  if (from) where.push(gte(schema.transactions.date, from));
  if (to) where.push(lte(schema.transactions.date, to));
  if (sp.q) where.push(ilike(schema.transactions.description, `%${sp.q.replace(/[%_\\]/g, "")}%`));
  return { where, from, to };
}
