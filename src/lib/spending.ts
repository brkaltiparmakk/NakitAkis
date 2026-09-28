import { type ISODate, addDays, addMonths, diffDays, startOfMonth } from "@/lib/dates";
import { round2 } from "@/lib/money";

// Günlük harcama tahmininde sayılmayan gider kategorileri: bunlar projeksiyonda zaten ayrıca hesaplanıyor
// (kredi taksitleri, KMH/kart faizi).
const EXCLUDED = new Set(["Kredi Taksidi", "Faiz / Masraf"]);

// Çıkışların toplamı; bir artı tutar yalnızca aynı tutarlı bir çıkışı birebir karşılıyorsa iade sayılıp düşülür.
// (Her artıyı düşmek, ör. BES ödemesi ya da kart ödemesi gibi girişleri de harcamadan çıkarırdı.)
export function netSpend(list: { amount: number }[]): number {
  const refunds = list.filter((t) => t.amount > 0).map((t) => t.amount.toFixed(2));
  let sum = 0;
  for (const t of list) {
    if (t.amount >= 0) continue;
    const i = refunds.indexOf((-t.amount).toFixed(2));
    if (i >= 0) refunds.splice(i, 1);
    else sum -= t.amount;
  }
  return round2(sum);
}

export type SpendTx = {
  date: ISODate;
  amount: number;
  kind: string | null;
  category: string | null;
  installmentNo?: number | null;
};

// Otomatik ortalamalı düzenli kalemlerin (ör. düzensiz gelen serbest gelir) penceresi: son 12 tam ay
export const AVERAGE_MONTHS = 12;

// Ortalama için kullanılacak tam aylar: son `months` tam ay, veri daha yeniyse verinin başladığı ilk tam aydan itibaren.
// İçinde bulunulan ay eksik olduğu için sayılmaz.
export function fullMonthWindow(earliest: ISODate, today: ISODate, months = AVERAGE_MONTHS) {
  const end = startOfMonth(today);
  let start = startOfMonth(addMonths(today, -months));
  const firstFull = earliest === startOfMonth(earliest) ? earliest : startOfMonth(addMonths(earliest, 1));
  if (firstFull > start) start = firstFull;
  return { start, end, count: Math.max(0, Math.round(diffDays(start, end) / 30.44)) };
}

// Bir hesabın aylık tipik harcaması: son `months` tam ayın aylık toplamlarının medyanı.
// Hesapta o kadar eski veri yoksa veri olan tam aylar kullanılır; hiç tam ay yoksa son 30 günün toplamı alınır.
// includeUncategorized: kart hesaplarında kategorisiz satırlar da harcamadır; vadesizde ise çoğu havale olduğu için sayılmaz.
export function averageMonthlySpend(txs: SpendTx[], today: ISODate, opts: { months?: number; includeUncategorized: boolean }): number {
  const months = opts.months ?? 3;
  const isSpend = (t: SpendTx) =>
    !t.installmentNo &&
    (t.kind === "expense" ? !EXCLUDED.has(t.category ?? "") : t.kind === null && opts.includeUncategorized);
  const spend = txs.filter(isSpend);
  const total = netSpend;
  if (!txs.length) return 0;

  const earliest = txs.reduce((m, t) => (t.date < m ? t.date : m), txs[0].date);
  const monthEnd = startOfMonth(today);
  let start = startOfMonth(addMonths(today, -months));
  // İlk ay eksik olabileceği için veri başlangıcından sonraki ilk tam aydan başla
  const firstFull = earliest === startOfMonth(earliest) ? earliest : startOfMonth(addMonths(earliest, 1));
  if (firstFull > start) start = firstFull;
  const fullMonths = Math.round(diffDays(start, monthEnd) / 30.44);

  if (fullMonths >= 1) {
    // Aylık toplamların medyanı: vergi gibi tek seferlik büyük harcamalar tahmini şişirmez
    const totals = Array.from({ length: fullMonths }, (_, i) => {
      const from = addMonths(start, i);
      const to = addMonths(start, i + 1);
      return total(spend.filter((t) => t.date >= from && t.date < to));
    }).sort((a, b) => a - b);
    const mid = Math.floor(totals.length / 2);
    return round2(totals.length % 2 ? totals[mid] : (totals[mid - 1] + totals[mid]) / 2);
  }
  const from = addDays(today, -30);
  return total(spend.filter((t) => t.date > from && t.date <= today));
}

// Bir kategorinin (ör. düzensiz gelen serbest gelir) aylık ortalaması: son 12 tam aydaki tutarların toplamı / ay sayısı.
// earliest: kullanıcının en eski işlem tarihi; ayların hiç ödeme gelmeyenleri de sayılsın diye kategoriden değil tüm veriden alınır.
export function categoryMonthlyAverage(
  txs: { date: ISODate; amount: number }[],
  direction: "in" | "out",
  earliest: ISODate,
  today: ISODate,
  months = AVERAGE_MONTHS,
): number {
  const w = fullMonthWindow(earliest, today, months);
  if (w.count < 1) return 0;
  const sum = txs
    .filter((t) => t.date >= w.start && t.date < w.end)
    .reduce((a, t) => a + (direction === "in" ? t.amount : -t.amount), 0);
  return Math.max(0, round2(sum / w.count));
}
