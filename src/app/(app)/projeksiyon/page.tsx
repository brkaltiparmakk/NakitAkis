import Link from "next/link";
import { BalanceChart } from "@/components/Charts";
import { Card, Empty, Money, PageHeader, Stat, cx } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { projectionInput } from "@/lib/data";
import { addMonths, formatTr, todayIso } from "@/lib/dates";
import { round2 } from "@/lib/money";
import { project } from "@/lib/projection";

const HORIZONS = [3, 6, 12, 24];
const KIND_LABEL = { recurring: "Düzenli", loan: "Kredi", card: "Kart", kmh: "KMH", spend: "Harcama" } as const;

export default async function ProjectionPage({ searchParams }: { searchParams: Promise<{ ay?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const months = HORIZONS.includes(Number(sp.ay)) ? Number(sp.ay) : 6;
  const today = todayIso();
  const input = await projectionInput(user.id, today, addMonths(today, months));
  const result = project(input);
  const current = round2(input.checking.reduce((a, c) => a + c.balance, 0));
  const end = result.days[result.days.length - 1]?.total ?? current;
  const series = [{ date: today, total: current }, ...result.days.map((d) => ({ date: d.date, total: d.total }))];

  let running = current;
  const rows = result.events.map((e) => {
    running = round2(running + e.amount);
    return { ...e, running };
  });

  return (
    <>
      <PageHeader
        title="Projeksiyon"
        description="Bugünkü bakiyeden başlayarak düzenli kalemler, kredi taksitleri, kart ekstre ödemeleri (asgari/tam), taksitler ve KMH faizi ile gelecekteki nakit durumunuz."
        actions={
          <div className="flex gap-1 rounded-lg border border-line bg-surface p-1">
            {HORIZONS.map((h) => (
              <Link
                key={h}
                href={`?ay=${h}`}
                className={cx("rounded-md px-3 py-1 text-sm", h === months ? "bg-accent text-white" : "text-muted hover:bg-subtle")}
              >
                {h} ay
              </Link>
            ))}
          </div>
        }
      />

      {input.snap.accounts.length === 0 ? (
        <Empty>
          Projeksiyon için önce <Link href="/hesaplar" className="text-accent underline">hesap ekleyin</Link>.
        </Empty>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Bugünkü nakit" value={<Money value={current} />} tone={current < 0 ? "neg" : undefined} />
            <Stat label={`${months} ay sonra`} value={<Money value={end} />} tone={end < 0 ? "neg" : undefined} hint={`Değişim: ${new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", signDisplay: "always" }).format(end - current)}`} />
            <Stat
              label="En düşük bakiye"
              value={result.lowest ? <Money value={result.lowest.total} /> : "—"}
              tone={result.lowest && result.lowest.total < 0 ? "neg" : undefined}
              hint={result.lowest ? formatTr(result.lowest.date) : undefined}
            />
            <Stat
              label="Dönem sonu kart borcu"
              value={<Money value={round2(result.cards.reduce((a, c) => a + (c.cycles[c.cycles.length - 1]?.carried ?? 0), 0))} />}
              hint="Asgari ödeme sonrası devreden"
            />
          </div>

          <Card title="Toplam nakit (vadesiz hesaplar)" className="mb-6">
            <BalanceChart data={series} />
          </Card>

          {result.cards.length > 0 && (
            <Card title="Kart ekstre döngüleri" className="mb-6">
              <div className="grid gap-6 lg:grid-cols-2">
                {result.cards.map((c) => (
                  <div key={c.id}>
                    <div className="mb-2 font-medium">{c.name}</div>
                    <div className="overflow-x-auto">
                      <table className="data">
                        <thead>
                          <tr>
                            <th>Kesim</th>
                            <th>Son ödeme</th>
                            <th className="text-right">Ekstre</th>
                            <th className="text-right">Faiz</th>
                            <th className="text-right">Ödeme</th>
                            <th className="text-right">Devreden</th>
                          </tr>
                        </thead>
                        <tbody>
                          {c.cycles.map((cy) => (
                            <tr key={cy.statementDate} className={cy.actual ? "" : "text-muted"}>
                              <td className="whitespace-nowrap">{formatTr(cy.statementDate)}{cy.actual ? "" : " *"}</td>
                              <td className="whitespace-nowrap">{formatTr(cy.dueDate)}</td>
                              <td className="text-right"><Money value={cy.statement} /></td>
                              <td className="text-right">{cy.interest ? <Money value={cy.interest} /> : "—"}</td>
                              <td className="text-right"><Money value={cy.payment} /></td>
                              <td className="text-right"><Money value={cy.carried} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted">
                * Tahmini. Yeni harcama, kartın &quot;tahmini aylık yeni harcama&quot; ayarından; faiz akdi faiz + %30 KKDF/BSMV ile hesaplanır.
              </p>
            </Card>
          )}

          <Card title="Beklenen hareketler">
            {rows.length === 0 ? (
              <Empty>
                Bu dönemde beklenen hareket yok. <Link href="/planlama" className="text-accent underline">Düzenli kalem veya kredi ekleyin</Link>.
              </Empty>
            ) : (
              <div className="max-h-[600px] overflow-auto">
                <table className="data">
                  <thead className="sticky top-0 bg-surface">
                    <tr>
                      <th>Tarih</th>
                      <th>Kalem</th>
                      <th>Tür</th>
                      <th className="text-right">Tutar</th>
                      <th className="text-right">Bakiye</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((e, i) => (
                      <tr key={i}>
                        <td className="whitespace-nowrap">{formatTr(e.date)}</td>
                        <td>{e.label}</td>
                        <td className="text-muted">{KIND_LABEL[e.kind]}</td>
                        <td className="text-right"><Money value={e.amount} signed /></td>
                        <td className={cx("text-right tabular-nums", e.running < 0 && "text-neg")}><Money value={e.running} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </>
  );
}
