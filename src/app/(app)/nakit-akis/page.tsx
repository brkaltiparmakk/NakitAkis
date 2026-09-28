import Link from "next/link";
import { Button, Card, Empty, Field, Input, PageHeader, Select, cx } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { balanceAt, buildBuckets, type Flow, type Granularity } from "@/lib/cashflow";
import { anchorOf, checkingFlows, projectionInput } from "@/lib/data";
import { addDays, addMonths, diffDays, startOfMonth, todayIso } from "@/lib/dates";
import { parseDate } from "@/lib/import/normalize";
import { round2, tl } from "@/lib/money";
import { project } from "@/lib/projection";

const VIEWS: Record<string, Granularity> = { gunluk: "daily", haftalik: "weekly", aylik: "monthly" };
const MAX_COLUMNS = { daily: 62, weekly: 60, monthly: 36 };

export default async function CashflowPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const today = todayIso();
  const viewKey = sp.gorunum && VIEWS[sp.gorunum] ? sp.gorunum : "aylik";
  const g = VIEWS[viewKey];
  const defaults = {
    daily: [addDays(today, -14), addDays(today, 30)],
    weekly: [addDays(today, -8 * 7), addDays(today, 12 * 7)],
    monthly: [startOfMonth(addMonths(today, -3)), addDays(startOfMonth(addMonths(today, 7)), -1)],
  }[g];
  const start = parseDate(sp.baslangic ?? null) ?? defaults[0];
  let end = parseDate(sp.bitis ?? null) ?? defaults[1];
  if (end < start) end = start;
  const maxDays = { daily: MAX_COLUMNS.daily, weekly: MAX_COLUMNS.weekly * 7, monthly: MAX_COLUMNS.monthly * 31 }[g];
  const clamped = diffDays(start, end) > maxDays;
  if (clamped) end = addDays(start, maxDays);

  const input = await projectionInput(user.id, today, end > today ? end : today);
  const accounts = input.snap.checking;
  const events = end > today ? project(input).events : [];
  // Başlangıçtan bir gün önceki toplam bakiye; başlangıç gelecekteyse aradaki tahmini hareketler eklenir
  const dayBefore = addDays(start, -1);
  const actualUntil = dayBefore < today ? dayBefore : today;
  const opening = round2(
    accounts.reduce(
      (sum, c) => sum + balanceAt(anchorOf(c.account), input.snap.txs.filter((t) => t.accountId === c.account.id), actualUntil),
      0,
    ) + events.filter((e) => e.date <= dayBefore).reduce((a, e) => a + e.amount, 0),
  );
  const actual = start <= today ? await checkingFlows(user.id, start, end < today ? end : today) : [];
  const projected: Flow[] = events.map((e) => ({ date: e.date, amount: e.amount, category: e.category, projected: true }));
  // Bugünden önceki başlangıçta, bugüne kadar olan kısım gerçekleşen; sonrası tahmini
  const buckets = buildBuckets({ start, end, granularity: g, opening, flows: [...actual, ...projected], today });

  const inCats = [...new Set(buckets.flatMap((b) => Object.keys(b.inflows)))].sort();
  const outCats = [...new Set(buckets.flatMap((b) => Object.keys(b.outflows)))].sort();
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
          </div>
        </form>
        {clamped && <p className="mt-2 text-xs text-warn">Tablo çok genişlediği için bitiş tarihi kısaltıldı; daha uzun dönem için haftalık/aylık görünümü kullanın.</p>}
      </Card>

      {accounts.length === 0 ? (
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
                <Row label="Net akış" strong buckets={buckets} value={(b) => tl(b.net)} neg={(b) => b.net < 0} />
                <Row label="Dönem sonu bakiye" strong buckets={buckets} value={(b) => tl(b.closing)} neg={(b) => b.closing < 0} />
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}

type B = ReturnType<typeof buildBuckets>[number];

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
