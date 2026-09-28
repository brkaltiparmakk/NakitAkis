import { parseAmount, parseDate } from "@/lib/import/normalize";

// Form alanlarını okuma yardımcıları; Türkçe sayı biçimi (1.234,56) kabul edilir
export function str(f: FormData, k: string): string {
  return String(f.get(k) ?? "").trim();
}
export function optStr(f: FormData, k: string): string | null {
  return str(f, k) || null;
}
export function money(f: FormData, k: string): string | null {
  const n = parseAmount(str(f, k));
  return n === null ? null : n.toFixed(2);
}
// "%4,25" gibi girilen yüzde oranı → 0.0425
export function percent(f: FormData, k: string): string | null {
  const n = parseAmount(str(f, k).replace("%", ""));
  return n === null ? null : (n / 100).toFixed(5);
}
export function int(f: FormData, k: string, min: number, max: number): number | null {
  const n = Number.parseInt(str(f, k), 10);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}
export function isoDate(f: FormData, k: string): string | null {
  return parseDate(str(f, k));
}
