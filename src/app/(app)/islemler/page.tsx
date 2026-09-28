import { and, count, sql } from "drizzle-orm";
import { Suspense } from "react";
import { deleteTransaction, matchTransfers, reapplyRules } from "@/app/actions/categories";
import { BulkBar, RowCheck, SelectAll } from "@/components/BulkSelect";
import { CategoryCell } from "@/components/CategoryCell";
import { TxFilterBar } from "@/components/TxFilterBar";
import { Button, Card, Money, PageHeader, Stat, cx } from "@/components/ui";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getAccounts, getCategories } from "@/lib/data";
import { formatTr, todayIso } from "@/lib/dates";
import { round2, tl, toNum } from "@/lib/money";
import { SORTS, transactionFilters } from "@/lib/transactionFilters";

const PAGE = 100;

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const [accounts, categories] = await Promise.all([getAccounts(user.id), getCategories(user.id)]);
  const page = Math.max(1, Number(sp.sayfa) || 1);
  const transferCategoryIds = categories.filter((c) => c.kind === "transfer").map((c) => c.id);
  const { where, orderBy } = transactionFilters(user.id, sp, { transferCategoryIds });
  const t = schema.transactions;

  const [rows, [totals], byCategory] = await Promise.all([
    db()
      .select()
      .from(t)
      .where(and(...where))
      .orderBy(...orderBy)
      .limit(PAGE)
      .offset((page - 1) * PAGE),
    db()
      .select({
        n: count(),
        inflow: sql<string>`coalesce(sum(${t.amount}) filter (where ${t.amount} > 0), 0)`,
        outflow: sql<string>`coalesce(sum(${t.amount}) filter (where ${t.amount} < 0), 0)`,
        uncategorized: sql<number>`count(*) filter (where ${t.categoryId} is null)`,
      })
      .from(t)
      .where(and(...where)),
    // Filtrelenen çıkışların kategorilere dağılımı (en büyük 6)
    db()
      .select({ categoryId: t.categoryId, total: sql<string>`sum(${t.amount})`, n: count() })
      .from(t)
      .where(and(...where, sql`${t.amount} < 0`))
      .groupBy(t.categoryId)
      .orderBy(sql`sum(${t.amount}) asc`)
      .limit(6),
  ]);

  const total = Number(totals.n);
  const inflow = toNum(totals.inflow);
  const outflow = -toNum(totals.outflow);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const accById = new Map(accounts.map((a) => [a.id, a]));
  const catById = new Map(categories.map((c) => [c.id, c]));
  const maxCat = Math.max(1, ...byCategory.map((c) => -toNum(c.total)));
  const qs = (p: number) => {
    const next = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
    next.set("sayfa", String(p));
    return `?${next}`;
  };
  const exportQs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "sayfa") as [string, string][]);

  return (
    <>
      <PageHeader
        title="İşlemler"
        description="Filtreler değiştikçe liste kendiliğinden güncellenir. Kategoriyi satırdan tek tek ya da birden çok satır seçerek toplu değiştirebilirsiniz."
        actions={
          <div className="flex flex-wrap gap-2">
            <a
              href={`/islemler/excel?${exportQs}`}
              className="inline-flex items-center rounded-lg border border-line px-3 py-2 text-sm font-medium hover:bg-subtle"
            >
              Excel&apos;e aktar
            </a>
            <form action={matchTransfers}>
              <Button variant="ghost" title="Bir hesaptan çıkıp diğer hesabınıza aynı tutarla giren havaleleri iç transfer yapar">
                Transferleri eşleştir
              </Button>
            </form>
            <form action={reapplyRules}>
              <Button variant="ghost" title="Kategori kurallarını kategorisiz işlemlere yeniden uygular">
                Kuralları uygula
              </Button>
            </form>
          </div>
        }
      />

      <Card className="mb-4">
        <Suspense>
          <TxFilterBar
            accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
            categories={categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind }))}
            today={todayIso()}
            sorts={SORTS}
          />
        </Suspense>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="İşlem" value={total.toLocaleString("tr-TR")} hint={totals.uncategorized ? `${Number(totals.uncategorized).toLocaleString("tr-TR")} kategorisiz` : "Hepsi kategorili"} />
        <Stat label="Toplam giriş" value={<Money value={inflow} />} tone="pos" />
        <Stat label="Toplam çıkış" value={<Money value={-outflow} />} tone="neg" />
        <Stat label="Net" value={<Money value={round2(inflow - outflow)} signed />} />
      </div>

      {byCategory.length > 0 && (
        <Card title="Çıkışların kategorilere dağılımı" className="mb-4">
          <ul className="grid gap-x-8 gap-y-2 text-sm md:grid-cols-2">
            {byCategory.map((c) => {
              const cat = c.categoryId ? catById.get(c.categoryId) : null;
              const value = -toNum(c.total);
              return (
                <li key={c.categoryId ?? "none"}>
                  <div className="flex justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <span className="inline-block size-2 rounded-full" style={{ background: cat?.color ?? "#94a3b8" }} />
                      {cat?.name ?? "Kategorisiz"}
                      <span className="text-xs text-muted">{c.n} işlem</span>
                    </span>
                    <span className="tabular-nums">{tl(value)}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-subtle">
                    <div className="h-1.5 rounded-full bg-series-1" style={{ width: `${Math.max(2, (value / maxCat) * 100)}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card>
        <div className="mb-3">
          <BulkBar categories={categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind }))} />
        </div>
        <div className="overflow-x-auto">
          <table className="data">
            <thead>
              <tr>
                <th className="w-8"><SelectAll /></th>
                <th>Tarih</th>
                <th>Açıklama</th>
                <th>Kategori</th>
                <th className="text-right">Tutar</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const acc = accById.get(r.accountId);
                const amount = toNum(r.amount);
                return (
                  <tr key={r.id} className="hover:bg-subtle/60">
                    <td><RowCheck id={r.id} /></td>
                    <td className="whitespace-nowrap">
                      {formatTr(r.date)}
                      <div className="text-xs text-muted">{acc?.name}</div>
                    </td>
                    <td className="min-w-64">
                      <span title={r.description}>{r.description}</span>
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {r.installmentNo && (
                          <span className="rounded-full bg-subtle px-2 py-0.5 text-xs text-muted">
                            {r.installmentNo}/{r.installmentTotal} taksit
                          </span>
                        )}
                        {acc?.type === "credit_card" && (
                          <span className="rounded-full bg-subtle px-2 py-0.5 text-xs text-muted">kart</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <CategoryCell txId={r.id} description={r.description} categoryId={r.categoryId} categories={categories} />
                    </td>
                    <td className={cx("whitespace-nowrap text-right font-medium tabular-nums", amount < 0 ? "text-neg" : "text-pos")}>
                      {tl(amount)}
                    </td>
                    <td>
                      <form action={deleteTransaction}>
                        <input type="hidden" name="id" value={r.id} />
                        <Button variant="danger" title="İşlemi sil">✕</Button>
                      </form>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-muted">Bu filtrelere uyan işlem yok.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {total > 0 && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-muted">
              {((page - 1) * PAGE + 1).toLocaleString("tr-TR")}–{Math.min(page * PAGE, total).toLocaleString("tr-TR")} /{" "}
              {total.toLocaleString("tr-TR")} işlem
            </span>
            <div className="flex items-center gap-3">
              {page > 1 && <a href={qs(page - 1)} className="text-accent">← Önceki</a>}
              <span className="text-muted">Sayfa {page} / {pages}</span>
              {page < pages && <a href={qs(page + 1)} className="text-accent">Sonraki →</a>}
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
