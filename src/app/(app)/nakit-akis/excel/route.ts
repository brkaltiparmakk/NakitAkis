import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { cashflowTable } from "@/lib/cashflowTable";
import { xlsxResponse } from "@/lib/excel";

export async function GET(req: NextRequest) {
  const user = await requireUser();
  const sp = Object.fromEntries(req.nextUrl.searchParams);
  const { start, end, buckets, inCats, outCats, undatedNet } = await cashflowTable(user.id, sp);

  const row = (label: string, f: (b: (typeof buckets)[number]) => number | null) => [label, ...buckets.map(f)];
  const rows: (string | number | null)[][] = [
    ["Kalem", ...buckets.map((b) => (b.projected ? `${b.label} (tahmini)` : b.label))],
    row("Dönem başı bakiye", (b) => b.opening),
    ["Girişler"],
    ...inCats.map((c) => row(`  ${c}`, (b) => b.inflows[c] ?? null)),
    row("Toplam giriş", (b) => b.totalIn),
    ["Çıkışlar"],
    ...outCats.map((c) => row(`  ${c}`, (b) => (b.outflows[c] ? -b.outflows[c] : null))),
    row("Toplam çıkış", (b) => -b.totalOut),
  ];
  if (buckets.some((b) => b.internalNet !== 0)) rows.push(row("Kendi hesaplarım arası (net)", (b) => b.internalNet || null));
  rows.push(row("Net akış", (b) => b.net), row("Dönem sonu bakiye", (b) => b.closing));
  if (undatedNet !== 0) {
    rows.push(row("Dönem sonu (alacaklar gelirse)", (b) => (b.projected ? Math.round((b.closing + undatedNet) * 100) / 100 : null)));
  }

  return xlsxResponse(`nakit-akis_${start}_${end}.xlsx`, "Nakit Akış", rows, [32, ...buckets.map(() => 16)]);
}
