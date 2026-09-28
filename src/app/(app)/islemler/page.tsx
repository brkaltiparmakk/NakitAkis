import { and, desc, eq, gte, ilike, isNull, lte, type SQL } from "drizzle-orm";
import { deleteTransaction, reapplyRules } from "@/app/actions/categories";
import { CategoryCell } from "@/components/CategoryCell";
import { Button, Card, Field, Input, Money, PageHeader, Select } from "@/components/ui";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getAccounts, getCategories } from "@/lib/data";
import { formatTr } from "@/lib/dates";
import { parseDate } from "@/lib/import/normalize";
import { toNum } from "@/lib/money";

const PAGE = 200;

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const [accounts, categories] = await Promise.all([getAccounts(user.id), getCategories(user.id)]);
  const page = Math.max(1, Number(sp.sayfa) || 1);

  const where: SQL[] = [eq(schema.transactions.userId, user.id)];
  const isUuid = (v?: string) => !!v && /^[0-9a-f-]{36}$/i.test(v);
  if (isUuid(sp.hesap)) where.push(eq(schema.transactions.accountId, sp.hesap!));
  if (sp.kategori === "yok") where.push(isNull(schema.transactions.categoryId));
  else if (isUuid(sp.kategori)) where.push(eq(schema.transactions.categoryId, sp.kategori!));
  const from = parseDate(sp.baslangic ?? null);
  const to = parseDate(sp.bitis ?? null);
  if (from) where.push(gte(schema.transactions.date, from));
  if (to) where.push(lte(schema.transactions.date, to));
  if (sp.q) where.push(ilike(schema.transactions.description, `%${sp.q.replace(/[%_]/g, "")}%`));

  const rows = await db()
    .select()
    .from(schema.transactions)
    .where(and(...where))
    .orderBy(desc(schema.transactions.date), desc(schema.transactions.createdAt))
    .limit(PAGE + 1)
    .offset((page - 1) * PAGE);
  const hasMore = rows.length > PAGE;
  const list = rows.slice(0, PAGE);
  const accName = new Map(accounts.map((a) => [a.id, a.name]));
  const qs = (p: number) => `?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v)), sayfa: String(p) } as Record<string, string>)}`;

  return (
    <>
      <PageHeader
        title="İşlemler"
        description="Kategorisi yanlış olan işlemi düzeltin; isterseniz anahtar kelime kural olarak kaydedilir ve benzerleri de düzelir."
        actions={
          <form action={reapplyRules}>
            <Button variant="ghost">Kuralları kategorisizlere uygula</Button>
          </form>
        }
      />
      <Card className="mb-4">
        <form className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Field label="Hesap">
            <Select name="hesap" defaultValue={sp.hesap ?? ""}>
              <option value="">Tümü</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
          <Field label="Kategori">
            <Select name="kategori" defaultValue={sp.kategori ?? ""}>
              <option value="">Tümü</option>
              <option value="yok">Kategorisiz</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Başlangıç"><Input type="date" name="baslangic" defaultValue={from ?? ""} /></Field>
          <Field label="Bitiş"><Input type="date" name="bitis" defaultValue={to ?? ""} /></Field>
          <Field label="Açıklamada ara"><Input name="q" defaultValue={sp.q ?? ""} /></Field>
          <div className="flex items-end"><Button>Filtrele</Button></div>
        </form>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="data">
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Hesap</th>
                <th>Açıklama</th>
                <th>Kategori</th>
                <th className="text-right">Tutar</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.id}>
                  <td className="whitespace-nowrap">{formatTr(t.date)}</td>
                  <td className="whitespace-nowrap text-muted">{accName.get(t.accountId)}</td>
                  <td>
                    {t.description}
                    {t.installmentNo && <span className="ml-1 text-xs text-muted">({t.installmentNo}/{t.installmentTotal} taksit)</span>}
                  </td>
                  <td>
                    <CategoryCell txId={t.id} description={t.description} categoryId={t.categoryId} categories={categories} />
                  </td>
                  <td className="whitespace-nowrap text-right"><Money value={toNum(t.amount)} signed /></td>
                  <td>
                    <form action={deleteTransaction}>
                      <input type="hidden" name="id" value={t.id} />
                      <Button variant="danger" title="İşlemi sil">✕</Button>
                    </form>
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-muted">İşlem bulunamadı.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex justify-between text-sm">
          {page > 1 ? <a href={qs(page - 1)} className="text-accent">← Önceki</a> : <span />}
          {hasMore && <a href={qs(page + 1)} className="text-accent">Sonraki →</a>}
        </div>
      </Card>
    </>
  );
}
