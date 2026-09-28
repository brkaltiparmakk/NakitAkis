import { diffDays, type ISODate } from "@/lib/dates";

export type TransferCandidate = {
  id: string;
  accountId: string;
  date: ISODate;
  amount: number;
  // Kategorisiz mi, yoksa zaten iç transfer mi
  categorized: "none" | "internal";
};

// Kendi vadesiz hesaplarınız arasındaki transfer çiftlerini bulur: bir hesaptan çıkan tutar,
// başka bir hesaba aynı tutarla en fazla `maxDays` gün içinde giriyorsa ikisi de iç transferdir.
// Yalnızca kategorisiz (ya da zaten iç transfer olan) işlemler eşlenir; her işlem en fazla bir kez kullanılır.
// Dönen liste, kategorisi "Hesaplar Arası Transfer" yapılacak kategorisiz işlemlerin kimlikleridir.
export function findTransferPairs(txs: TransferCandidate[], opts: { maxDays?: number; minAmount?: number } = {}): string[] {
  const maxDays = opts.maxDays ?? 1;
  const minAmount = opts.minAmount ?? 100;
  const inflows = new Map<string, TransferCandidate[]>();
  for (const t of txs) {
    if (t.amount >= minAmount) {
      const key = t.amount.toFixed(2);
      inflows.set(key, [...(inflows.get(key) ?? []), t]);
    }
  }
  const used = new Set<string>();
  const result: string[] = [];
  const outflows = txs.filter((t) => t.amount <= -minAmount).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  for (const out of outflows) {
    const candidates = (inflows.get((-out.amount).toFixed(2)) ?? []).filter(
      (i) => !used.has(i.id) && i.accountId !== out.accountId && Math.abs(diffDays(out.date, i.date)) <= maxDays,
    );
    if (!candidates.length) continue;
    candidates.sort((a, b) => Math.abs(diffDays(out.date, a.date)) - Math.abs(diffDays(out.date, b.date)));
    const match = candidates[0];
    used.add(match.id);
    used.add(out.id);
    for (const t of [out, match]) if (t.categorized === "none") result.push(t.id);
  }
  return result;
}
