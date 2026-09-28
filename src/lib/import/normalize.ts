import type { ISODate } from "@/lib/dates";
import { round2 } from "@/lib/money";

export type Cell = string | number | null;

// Türkçe metni karşılaştırma için sadeleştirir: küçük harf + ASCII (ç→c, ğ→g, ı→i, ö→o, ş→s, ü→u).
// Bazı PDF'ler Türkçe karakterleri düşürdüğü için eşleştirmeler hep bu biçim üzerinden yapılır.
export function foldTr(s: string): string {
  return s
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i")
    .replace(/\s+/g, " ")
    .trim();
}

// "1.234,56", "-1.234,56", "1.234,56-", "(1.234,56)", "1,234.56", "1234.56 TL", sayı → number
export function parseAmount(v: Cell | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? round2(v) : null;
  let s = v.replace(/ /g, " ").trim();
  if (!s) return null;
  s = s.replace(/(tl|try|₺)/gi, "").replace(/\s+/g, "");
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  if (s.endsWith("-")) {
    negative = !negative;
    s = s.slice(0, -1);
  } else if (s.endsWith("+")) {
    s = s.slice(0, -1);
  }
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let normalized: string;
  if (lastComma >= 0 && lastDot >= 0) {
    // İkisi de varsa en sondaki ondalık ayırıcıdır
    normalized =
      lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    normalized = /,\d{1,2}$/.test(s) && s.indexOf(",") === lastComma
      ? s.replace(",", ".")
      : s.replace(/,/g, "");
  } else if (lastDot >= 0) {
    // Tek nokta ve ardından tam 3 hane: Türkçe binlik ayırıcı kabul edilir (1.234 → 1234)
    normalized = s.indexOf(".") !== lastDot || /\.\d{3}$/.test(s) ? s.replace(/\./g, "") : s;
  } else {
    normalized = s;
  }
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return round2(negative ? -n : n);
}

const TR_MONTH_NAMES: Record<string, number> = {
  ocak: 1, subat: 2, mart: 3, nisan: 4, mayis: 5, haziran: 6,
  temmuz: 7, agustos: 8, eylul: 9, ekim: 10, kasim: 11, aralik: 12,
};

function iso(y: number, m: number, d: number): ISODate | null {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return dt.toISOString().slice(0, 10);
}

// Excel seri tarihi (1900 sistemi) → ISO
function fromExcelSerial(n: number): ISODate | null {
  if (n < 30000 || n > 80000) return null;
  const ms = Math.round((n - 25569) * 86400000);
  return new Date(ms).toISOString().slice(0, 10);
}

export function parseDate(v: Cell | undefined): ISODate | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return fromExcelSerial(v);
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?:\D|$)/);
  if (m) return iso(+m[3], +m[2], +m[1]);
  m = foldTr(s).match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})/);
  if (m && TR_MONTH_NAMES[m[2]]) return iso(+m[3], TR_MONTH_NAMES[m[2]], +m[1]);
  return null;
}

// Açıklamadaki taksit bilgisini bulur: "TAKSIT 2/6", "2/6 TAKSİT", "(2/6)", "2.TAKSIT/6"
export function parseInstallment(desc: string): { no: number; total: number } | null {
  const f = foldTr(desc);
  const patterns = [
    /taksit\D{0,6}(\d{1,2})\s*\/\s*(\d{1,2})/,
    /(\d{1,2})\s*\/\s*(\d{1,2})\s*taksit/,
    /\((\d{1,2})\s*\/\s*(\d{1,2})\)/,
    /(\d{1,2})\s*\.\s*taksit\s*\/\s*(\d{1,2})/,
  ];
  for (const p of patterns) {
    const m = f.match(p);
    if (m) {
      const no = +m[1];
      const total = +m[2];
      if (total >= 2 && total <= 48 && no >= 1 && no <= total) return { no, total };
    }
  }
  return null;
}

export function dedupeKey(date: ISODate, amount: number, description: string): string {
  const d = foldTr(description).replace(/[^a-z0-9]/g, "");
  return `${date}|${amount.toFixed(2)}|${d}`;
}
