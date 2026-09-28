import { type ISODate, addDays, formatTr, monthLabel, startOfMonth, startOfWeek } from "@/lib/dates";
import { round2 } from "@/lib/money";

export type Granularity = "daily" | "weekly" | "monthly";

// Bir hesabın gün sonu bakiyesi. Çapa (anchorDate günü sonu bakiyesi) yoksa 0'dan başlanır.
export function balanceAt(
  anchor: { date: ISODate; amount: number } | null,
  txs: { date: ISODate; amount: number }[],
  date: ISODate,
): number {
  if (!anchor) return round2(txs.filter((t) => t.date <= date).reduce((a, t) => a + t.amount, 0));
  if (date >= anchor.date) {
    return round2(anchor.amount + txs.filter((t) => t.date > anchor.date && t.date <= date).reduce((a, t) => a + t.amount, 0));
  }
  return round2(anchor.amount - txs.filter((t) => t.date > date && t.date <= anchor.date).reduce((a, t) => a + t.amount, 0));
}

// internal: kendi hesaplarınız arası transfer; girişlere/çıkışlara değil, ayrı bir net satıra yazılır
export type Flow = { date: ISODate; amount: number; category: string; projected: boolean; internal?: boolean };

export type Bucket = {
  key: ISODate;
  label: string;
  opening: number;
  inflows: Record<string, number>;
  outflows: Record<string, number>;
  totalIn: number;
  totalOut: number;
  internalNet: number;
  net: number;
  closing: number;
  projected: boolean;
};

export function bucketKey(d: ISODate, g: Granularity): ISODate {
  return g === "daily" ? d : g === "weekly" ? startOfWeek(d) : startOfMonth(d);
}

function nextKey(k: ISODate, g: Granularity): ISODate {
  if (g === "daily") return addDays(k, 1);
  if (g === "weekly") return addDays(k, 7);
  const [y, m] = k.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

function labelFor(k: ISODate, g: Granularity): string {
  if (g === "daily") return formatTr(k);
  if (g === "weekly") return `${formatTr(k)} – ${formatTr(addDays(k, 6))}`;
  return monthLabel(k);
}

// Klasik nakit akış tablosu: dönem başı + girişler − çıkışlar = dönem sonu
export function buildBuckets(opts: {
  start: ISODate;
  end: ISODate;
  granularity: Granularity;
  opening: number;
  flows: Flow[];
  today: ISODate;
}): Bucket[] {
  const { granularity: g } = opts;
  const buckets: Bucket[] = [];
  const index = new Map<ISODate, Bucket>();
  for (let k = bucketKey(opts.start, g); k <= opts.end; k = nextKey(k, g)) {
    const b: Bucket = {
      key: k,
      label: labelFor(k, g),
      opening: 0,
      inflows: {},
      outflows: {},
      totalIn: 0,
      totalOut: 0,
      internalNet: 0,
      net: 0,
      closing: 0,
      projected: nextKey(k, g) > addDays(opts.today, 1),
    };
    buckets.push(b);
    index.set(k, b);
  }
  for (const f of opts.flows) {
    if (f.date < opts.start || f.date > opts.end) continue;
    const b = index.get(bucketKey(f.date, g));
    if (!b) continue;
    if (f.internal) {
      b.internalNet = round2(b.internalNet + f.amount);
      continue;
    }
    const side = f.amount >= 0 ? b.inflows : b.outflows;
    side[f.category] = round2((side[f.category] ?? 0) + Math.abs(f.amount));
    if (f.amount >= 0) b.totalIn = round2(b.totalIn + f.amount);
    else b.totalOut = round2(b.totalOut - f.amount);
  }
  let running = opts.opening;
  for (const b of buckets) {
    b.opening = running;
    b.net = round2(b.totalIn - b.totalOut + b.internalNet);
    b.closing = round2(running + b.net);
    running = b.closing;
  }
  return buckets;
}
