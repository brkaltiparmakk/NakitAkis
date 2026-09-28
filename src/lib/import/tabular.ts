import type { ColumnMapping } from "@/db/schema";
import { type Cell, foldTr, parseAmount, parseDate, parseInstallment } from "./normalize";
import type { ParsedTx } from "./types";

// ---- Sütun tespiti ----

const HEADER_HINTS: Record<keyof Omit<ColumnMapping, "headerRow" | "invertSign">, RegExp[]> = {
  date: [/islem tarihi/, /^tarih/, /tarih$/, /valor/],
  description: [/aciklama/, /islem detayi/, /^islem$/, /islem adi/, /isyeri/, /detay/],
  amount: [/islem tutari/, /^tutar/, /tutar/, /miktar/],
  debit: [/^borc$/, /borc tutari/, /cikan/, /^cikis/],
  credit: [/^alacak$/, /alacak tutari/, /giren/, /^giris/],
  balance: [/bakiye/],
  label: [/etiket/, /harcama grubu/, /sektor/],
};

function matchCol(header: string[], patterns: RegExp[], taken: Set<number>): number | undefined {
  for (const p of patterns) {
    const i = header.findIndex((h, idx) => !taken.has(idx) && p.test(h));
    if (i >= 0) return i;
  }
  return undefined;
}

// İlk 40 satır içinde başlık gibi görünen satırı bulur
export function detectHeaderRow(rows: Cell[][]): number {
  let best = -1;
  let bestScore = 1;
  rows.slice(0, 40).forEach((row, i) => {
    const cells = row.map((c) => (typeof c === "string" ? foldTr(c) : ""));
    let score = 0;
    for (const patterns of Object.values(HEADER_HINTS)) {
      if (cells.some((c) => c.length < 40 && patterns.some((p) => p.test(c)))) score++;
    }
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  });
  return best;
}

// isCard: kart ekstrelerinde bazı bankalar harcamayı pozitif (Akbank), bazıları negatif (Garanti) yazar.
// Bizde harcama negatif olmalı; kartta tutarların çoğu pozitifse işaret ters çevrilir.
export function suggestMapping(rows: Cell[][], isCard: boolean): ColumnMapping | null {
  const headerRow = detectHeaderRow(rows);
  if (headerRow < 0) return null;
  const header = rows[headerRow].map((c) => (typeof c === "string" ? foldTr(c) : ""));
  const taken = new Set<number>();
  const pick = (k: keyof typeof HEADER_HINTS) => {
    const i = matchCol(header, HEADER_HINTS[k], taken);
    if (i !== undefined) taken.add(i);
    return i;
  };
  const date = pick("date");
  const balance = pick("balance");
  const debit = pick("debit");
  const credit = pick("credit");
  const amount = debit !== undefined && credit !== undefined ? undefined : pick("amount");
  const description = pick("description");
  const label = pick("label");
  if (date === undefined || description === undefined) return null;
  if (amount === undefined && (debit === undefined || credit === undefined)) return null;
  const mapping: ColumnMapping = { headerRow, date, description, amount, debit, credit, balance, label, invertSign: false };
  if (isCard) {
    const amounts = applyMapping(rows, mapping).transactions.map((t) => t.amount);
    mapping.invertSign = amounts.filter((a) => a > 0).length > amounts.filter((a) => a < 0).length;
  }
  return mapping;
}

// ---- Eşlemeyi uygulama ----

export type TabularResult = {
  transactions: ParsedTx[];
  skippedRows: number;
  // Dosyadaki en son tarihli satırın bakiyesi (varsa)
  balanceAnchor: { date: string; amount: number } | null;
};

export function applyMapping(rows: Cell[][], m: ColumnMapping): TabularResult {
  const transactions: ParsedTx[] = [];
  const balances: { date: string; amount: number; order: number }[] = [];
  let skippedRows = 0;

  rows.slice(m.headerRow + 1).forEach((row, order) => {
    const date = parseDate(row[m.date]);
    const description = String(row[m.description] ?? "").replace(/\s+/g, " ").trim();
    let amount: number | null;
    if (m.amount !== undefined) {
      amount = parseAmount(row[m.amount]);
    } else {
      const debit = Math.abs(parseAmount(row[m.debit!]) ?? 0);
      const credit = Math.abs(parseAmount(row[m.credit!]) ?? 0);
      amount = debit || credit ? credit - debit : null;
    }
    if (!date || amount === null || amount === 0) {
      if (row.some((c) => c !== null && c !== "")) skippedRows++;
      return;
    }
    if (m.invertSign) amount = -amount;
    const inst = parseInstallment(description);
    const label = m.label !== undefined ? String(row[m.label] ?? "").trim() : "";
    transactions.push({
      date,
      description: description || "(açıklama yok)",
      amount,
      installmentNo: inst?.no ?? null,
      installmentTotal: inst?.total ?? null,
      label: label || null,
    });
    if (m.balance !== undefined) {
      const b = parseAmount(row[m.balance]);
      if (b !== null) balances.push({ date, amount: b, order });
    }
  });

  return { transactions, skippedRows, balanceAnchor: latestBalance(balances) };
}

// Aynı gün birden fazla satır varsa dosyanın sıralamasına göre en son olanı seçilir.
function latestBalance(
  balances: { date: string; amount: number; order: number }[],
): { date: string; amount: number } | null {
  if (!balances.length) return null;
  const descending = balances[0].date > balances[balances.length - 1].date;
  const maxDate = balances.reduce((a, b) => (b.date > a ? b.date : a), balances[0].date);
  const sameDay = balances.filter((b) => b.date === maxDate);
  const pick = descending ? sameDay[0] : sameDay[sameDay.length - 1];
  return { date: pick.date, amount: pick.amount };
}

// Başlığın üstündeki "Anahtar;Değer" satırlarını metin satırlarına çevirir (ekstre özeti ve hesap sahibi için)
export function headerLines(rows: Cell[][], headerRow: number): string[] {
  const upto = headerRow >= 0 ? headerRow : Math.min(rows.length, 15);
  return rows.slice(0, upto).map((r) => r.filter((c) => c !== null && c !== "").join(" ").replace(/\s+/g, " ").trim());
}

export function detectHolderName(rows: Cell[][], headerRow: number): string | null {
  const upto = headerRow >= 0 ? headerRow : Math.min(rows.length, 15);
  for (const r of rows.slice(0, upto)) {
    const cells = r.filter((c) => c !== null && c !== "").map(String);
    if (cells.length >= 2 && /^(ad soyad|adi soyadi|musteri adi|hesap sahibi)/.test(foldTr(cells[0]))) {
      const name = cells[1].replace(/\s+/g, " ").trim();
      return name.split(" ").length >= 2 ? name : null;
    }
  }
  return null;
}

// ---- CSV ----

export function decodeText(buf: Uint8Array): string {
  const utf8 = new TextDecoder("utf-8").decode(buf);
  if (!utf8.includes("�")) return utf8.replace(/^﻿/, "");
  // Türk bankalarının CSV'leri sıklıkla Windows-1254 kodlamasıyla gelir
  return new TextDecoder("windows-1254").decode(buf);
}

export function parseCsv(text: string): Cell[][] {
  const sample = text.split(/\r?\n/).slice(0, 10).join("\n");
  const delimiter = [";", "\t", ","].reduce((best, d) =>
    sample.split(d).length > sample.split(best).length ? d : best,
  );
  const rows: Cell[][] = [];
  let row: Cell[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field.trim());
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field || row.length) {
    row.push(field.trim());
    rows.push(row);
  }
  return rows;
}
