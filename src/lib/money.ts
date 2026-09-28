export function toNum(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === "") return 0;
  return typeof v === "number" ? v : Number(v);
}

export function round2(n: number): number {
  // Negatif tutarlar da sıfırdan uzağa yuvarlansın (−12,345 → −12,35)
  return (Math.sign(n) * Math.round((Math.abs(n) + Number.EPSILON) * 100)) / 100 || 0;
}

const fmt = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" });
const fmtShort = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });

export function tl(n: number): string {
  return fmt.format(n);
}

export function tlShort(n: number): string {
  return `${fmtShort.format(n)} ₺`;
}
