import { and, desc } from "drizzle-orm";
import { deleteTransaction, matchTransfers, reapplyRules } from "@/app/actions/categories";
import { CategoryCell } from "@/components/CategoryCell";
import { Button, Card, Field, Input, Money, PageHeader, Select } from "@/components/ui";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getAccounts, getCategories } from "@/lib/data";
import { formatTr } from "@/lib/dates";
import { transactionFilters } from "@/lib/transactionFilters";
import { toNum } from "@/lib/money";

const PAGE = 200;

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const [accounts, categories] = await Promise.all([getAccounts(user.id), getCategories(user.id)]);
  const page = Math.max(1, Number(sp.sayfa) || 1);

  const { where, from, to } = transactionFilters(user.id, sp);
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
          <div className="flex flex-wrap gap-2">
            <a
              href={`/islemler/excel?${new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "sayfa") as [string, string][])}`}
              className="inline-flex items-center rounded-lg border border-line px-3 py-2 text-sm font-medium hover:bg-subtle"
            >
              Excel&apos;e aktar
            </a>
            <form action={matchTransfers}>
              <Button variant="ghost" title="Bir hesaptan çıkıp diğer hesabınıza aynı tutarla giren havaleleri iç transfer yapar">
                Hesaplar arası transferleri eşleştir
              </Button>
            </form>
            <form action={reapplyRules}>
              <Button variant="ghost">Kuralları kategorisizlere uygula</Button>
            </form>
          </div>
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
