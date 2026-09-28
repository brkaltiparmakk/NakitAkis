import { asc, desc, eq, gt, gte, ilike, isNull, lt, lte, notInArray, or, sql, type SQL } from "drizzle-orm";
import { schema } from "@/db";
import { parseAmount, parseDate } from "@/lib/import/normalize";

const isUuid = (v?: string) => !!v && /^[0-9a-f-]{36}$/i.test(v);

export const SORTS = {
  yeni: "Yeniden eskiye",
  eski: "Eskiden yeniye",
  buyuk: "Tutar (büyükten küçüğe)",
  kucuk: "Tutar (küçükten büyüğe)",
} as const;

// İşlemler sayfası ve Excel çıktısı için ortak filtreler:
// hesap, kategori, tarih aralığı, açıklama, tür (giriş/çıkış), tutar aralığı, transferleri gizleme
export function transactionFilters(
  userId: string,
  sp: Record<string, string | undefined>,
  opts: { transferCategoryIds?: string[] } = {},
) {
  const t = schema.transactions;
  const where: SQL[] = [eq(t.userId, userId)];
  if (isUuid(sp.hesap)) where.push(eq(t.accountId, sp.hesap!));
  if (sp.kategori === "yok") where.push(isNull(t.categoryId));
  else if (isUuid(sp.kategori)) where.push(eq(t.categoryId, sp.kategori!));
  const from = parseDate(sp.baslangic ?? null);
  const to = parseDate(sp.bitis ?? null);
  if (from) where.push(gte(t.date, from));
  if (to) where.push(lte(t.date, to));
  if (sp.q) where.push(ilike(t.description, `%${sp.q.replace(/[%_\\]/g, "")}%`));
  if (sp.tur === "giris") where.push(gt(t.amount, "0"));
  if (sp.tur === "cikis") where.push(lt(t.amount, "0"));
  // Tutar aralığı işaretten bağımsız (mutlak değer) uygulanır
  const min = parseAmount(sp.min ?? null);
  const max = parseAmount(sp.max ?? null);
  if (min !== null) where.push(sql`abs(${t.amount}) >= ${Math.abs(min)}`);
  if (max !== null) where.push(sql`abs(${t.amount}) <= ${Math.abs(max)}`);
  if (sp.transfer === "gizle" && opts.transferCategoryIds?.length) {
    where.push(or(isNull(t.categoryId), notInArray(t.categoryId, opts.transferCategoryIds))!);
  }

  const sort = (sp.sirala && sp.sirala in SORTS ? sp.sirala : "yeni") as keyof typeof SORTS;
  const orderBy = {
    yeni: [desc(t.date), desc(t.createdAt)],
    eski: [asc(t.date), asc(t.createdAt)],
    buyuk: [sql`abs(${t.amount}) desc`, desc(t.date)],
    kucuk: [sql`abs(${t.amount}) asc`, desc(t.date)],
  }[sort];

  return { where, from, to, sort, orderBy };
}
