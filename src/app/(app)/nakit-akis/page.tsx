import Link from "next/link";
import { Button, Card, Empty, Field, Input, PageHeader, Select, cx } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import type { Bucket } from "@/lib/cashflow";
import { cashflowTable } from "@/lib/cashflowTable";
import { tl } from "@/lib/money";

export default async function CashflowPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const { viewKey, start, end, clamped, hasAccounts, buckets, inCats, outCats, undatedNet } = await cashflowTable(user.id, sp);
  const excelHref = `/nakit-akis/excel?${new URLSearchParams({ gorunum: viewKey, baslangic: start, bitis: end })}`;
  const cell = (v: number | undefined) => (v ? tl(v) : "–");

  return (
    <>
      <PageHeader
        title="Nakit Akış Tablosu"
        description="Vadesiz hesaplarınızın dönem başı bakiyesi, girişleri, çıkışları ve dönem sonu bakiyesi. Bugünden sonraki dönemler projeksiyondan gelir ve tahminidir."
      />
      <Card className="mb-4">
        <form className="grid gap-3 sm:grid-cols-4">
          <Field label="Görünüm">
            <Select name="gorunum" defaultValue={viewKey}>
              <option value="gunluk">Günlük</option>
              <option value="haftalik">Haftalık</option>
              <option value="aylik">Aylık</option>
            </Select>
          </Field>
          <Field label="Başlangıç"><Input type="date" name="baslangic" defaultValue={start} /></Field>
          <Field label="Bitiş"><Input type="date" name="bitis" defaultValue={end} /></Field>
          <div className="flex items-end gap-2">
            <Button>Göster</Button>
            <Link href={`?gorunum=${viewKey}`} className="px-2 py-2 text-sm text-muted hover:text-fg">Varsayılan</Link>
            <a href={excelHref} className="px-2 py-2 text-sm text-accent hover:underline">Excel&apos;e aktar</a>
          </div>
        </form>
        {clamped && <p className="mt-2 text-xs text-warn">Tablo çok genişlediği için bitiş tarihi kısaltıldı; daha uzun dönem için haftalık/aylık görünümü kullanın.</p>}
      </Card>

      {!hasAccounts ? (
        <Empty>Nakit akışı için en az bir vadesiz hesap ekleyin ve döküm yükleyin.</Empty>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="data whitespace-nowrap">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-surface">Kalem</th>
                  {buckets.map((b) => (
                    <th key={b.key} className={cx("text-right", b.projected && "bg-subtle")}>
                      {b.label}
                      {b.projected && <div className="font-normal normal-case">tahmini</div>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <Row label="Dönem başı bakiye" strong buckets={buckets} value={(b) => tl(b.opening)} neg={(b) => b.opening < 0} />
                <SectionRow label="Girişler" span={buckets.length} />
                {inCats.map((c) => (
                  <Row key={`in-${c}`} label={c} indent buckets={buckets} value={(b) => cell(b.inflows[c])} />
                ))}
                <Row label="Toplam giriş" strong buckets={buckets} value={(b) => tl(b.totalIn)} className="text-pos" />
                <SectionRow label="Çıkışlar" span={buckets.length} />
                {outCats.map((c) => (
                  <Row key={`out-${c}`} label={c} indent buckets={buckets} value={(b) => cell(b.outflows[c])} />
                ))}
                <Row label="Toplam çıkış" strong buckets={buckets} value={(b) => tl(b.totalOut)} className="text-neg" />
                {buckets.some((b) => b.internalNet !== 0) && (
                  <Row
                    label="Kendi hesaplarım arası (net)"
                    buckets={buckets}
                    value={(b) => cell(b.internalNet)}
                    neg={(b) => b.internalNet < 0}
                    className="text-muted"
                  />
                )}
                <Row label="Net akış" strong buckets={buckets} value={(b) => tl(b.net)} neg={(b) => b.net < 0} />
                <Row label="Dönem sonu bakiye" strong buckets={buckets} value={(b) => tl(b.closing)} neg={(b) => b.closing < 0} />
                {undatedNet !== 0 && (
                  <Row
                    label="Dönem sonu (alacaklar gelirse)"
                    buckets={buckets}
                    value={(b) => (b.projected ? tl(b.closing + undatedNet) : "–")}
                    neg={(b) => b.projected && b.closing + undatedNet < 0}
                    className="text-muted"
                  />
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}

type B = Bucket;

function Row({
  label,
  buckets,
  value,
  strong,
  indent,
  neg,
  className,
}: {
  label: string;
  buckets: B[];
  value: (b: B) => string;
  strong?: boolean;
  indent?: boolean;
  neg?: (b: B) => boolean;
  className?: string;
}) {
  return (
    <tr className={cx(strong && "font-semibold")}>
      <td className={cx("sticky left-0 z-10 bg-surface", indent && "pl-6 text-muted")}>{label}</td>
      {buckets.map((b) => (
        <td key={b.key} className={cx("text-right tabular-nums", b.projected && "bg-subtle", neg?.(b) && "text-neg", className)}>
          {value(b)}
        </td>
      ))}
    </tr>
  );
}

function SectionRow({ label, span }: { label: string; span: number }) {
  return (
    <tr>
      <td className="sticky left-0 z-10 bg-surface pt-4 text-xs font-semibold uppercase tracking-wide text-muted">{label}</td>
      <td colSpan={span} />
    </tr>
  );
}
