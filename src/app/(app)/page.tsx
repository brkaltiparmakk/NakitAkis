import Link from "next/link";
import { BalanceChart, IncomeExpenseChart } from "@/components/Charts";
import { Card, Empty, Money, PageHeader, Stat } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { analysisRows, projectionInput } from "@/lib/data";
import { addDays, addMonths, formatTr, monthLabel, startOfMonth, todayIso } from "@/lib/dates";
import { round2 } from "@/lib/money";
import { project } from "@/lib/projection";

export default async function Dashboard() {
  const user = await requireUser();
  const today = todayIso();
  const input = await projectionInput(user.id, today, addDays(today, 90));
  const { snap } = input;

  if (snap.accounts.length === 0) {
    return (
      <>
        <PageHeader title="Hoş geldiniz" />
        <Card title="Başlamak için">
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li><Link href="/hesaplar" className="text-accent underline">Hesaplarınızı ve kredi kartlarınızı ekleyin</Link> (kesim ve son ödeme günleriyle).</li>
            <li><Link href="/yukle" className="text-accent underline">Hesap dökümü ve kart ekstrelerini yükleyin</Link> (Excel, CSV veya PDF).</li>
            <li><Link href="/planlama" className="text-accent underline">Maaş, kira, aidat gibi düzenli kalemleri ve ev kredinizi girin</Link>.</li>
            <li><Link href="/projeksiyon" className="text-accent underline">Projeksiyona</Link> ve <Link href="/nakit-akis" className="text-accent underline">nakit akış tablosuna</Link> bakın.</li>
          </ol>
        </Card>
      </>
    );
  }

  const result = project(input);
  const cash = round2(input.checking.reduce((a, c) => a + c.balance, 0));
  const in30 = result.days.find((d) => d.date === addDays(today, 30))?.total ?? cash;
  const cardDebt = round2(snap.cards.reduce((a, c) => a + (c.latest?.totalDue ?? 0) + c.unbilledSpend, 0));
  const upcoming = result.events.filter((e) => e.date <= addDays(today, 30) && e.amount < 0 && e.kind !== "spend").slice(0, 12);

  // Son 6 ayın gelir/gider analizi (transferler hariç, kart harcamaları dahil)
  const from = startOfMonth(addMonths(today, -5));
  const rows = await analysisRows(user.id, from, today);
  const months = Array.from({ length: 6 }, (_, i) => startOfMonth(addMonths(from, i)));
  const monthly = months.map((m) => {
    const inMonth = rows.filter((r) => r.date.startsWith(m.slice(0, 7)));
    return {
      label: monthLabel(m),
      income: round2(inMonth.filter((r) => r.amount > 0).reduce((a, r) => a + r.amount, 0)),
      expense: round2(inMonth.filter((r) => r.amount < 0).reduce((a, r) => a - r.amount, 0)),
    };
  });
  const thisMonth = rows.filter((r) => r.date >= startOfMonth(today) && r.amount < 0);
  const byCat = new Map<string, { total: number; color: string }>();
  for (const r of thisMonth) {
    const c = byCat.get(r.category) ?? { total: 0, color: r.color };
    c.total = round2(c.total - r.amount);
    byCat.set(r.category, c);
  }
  const catList = [...byCat.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 10);
  const maxCat = catList[0]?.[1].total ?? 1;

  return (
    <>
      <PageHeader title="Özet" description={`${formatTr(today)} itibarıyla`} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Toplam nakit" value={<Money value={cash} />} tone={cash < 0 ? "neg" : undefined} hint={`${input.checking.length} vadesiz hesap`} />
        <Stat label="Kart borçları" value={<Money value={cardDebt} />} hint="Son ekstre + dönem içi harcama" />
        <Stat label="30 gün sonra nakit" value={<Money value={in30} />} tone={in30 < 0 ? "neg" : undefined} hint="Tahmini" />
        <Stat
          label="90 günde en düşük"
          value={result.lowest ? <Money value={result.lowest.total} /> : "—"}
          tone={result.lowest && result.lowest.total < 0 ? "neg" : undefined}
          hint={result.lowest ? formatTr(result.lowest.date) : undefined}
        />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <Card title="Önümüzdeki 90 gün: toplam nakit" className="lg:col-span-2" actions={<Link href="/projeksiyon" className="text-xs text-accent">Ayrıntı →</Link>}>
          <BalanceChart data={[{ date: today, total: cash }, ...result.days]} height={240} />
        </Card>
        <Card title="Yaklaşan ödemeler (30 gün)">
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted">Yaklaşan ödeme yok.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {upcoming.map((e, i) => (
                <li key={i} className="flex justify-between gap-2 py-2">
                  <span>
                    <span className="text-muted">{formatTr(e.date).slice(0, 5)}</span> {e.label}
                  </span>
                  <Money value={e.amount} signed />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Aylık gelir ve gider" className="lg:col-span-2">
          {rows.length === 0 ? <Empty>Henüz işlem yok. <Link href="/yukle" className="text-accent underline">Ekstre yükleyin</Link>.</Empty> : <IncomeExpenseChart data={monthly} />}
          <p className="mt-2 text-xs text-muted">Kart harcamaları dahil; kart ödemeleri ve hesaplar arası transferler hariç.</p>
        </Card>
        <Card title={`Bu ay harcamalar · ${monthLabel(today)}`} actions={<Link href="/islemler?kategori=yok" className="text-xs text-accent">Kategorisizler →</Link>}>
          {catList.length === 0 ? (
            <p className="text-sm text-muted">Bu ay harcama yok.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {catList.map(([name, c]) => (
                <li key={name}>
                  <div className="flex justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <span className="inline-block size-2 rounded-full" style={{ background: c.color }} />
                      {name}
                    </span>
                    <Money value={c.total} />
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-subtle">
                    <div className="h-1.5 rounded-full bg-series-1" style={{ width: `${Math.max(2, (c.total / maxCat) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
