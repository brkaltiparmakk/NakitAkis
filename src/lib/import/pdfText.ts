import { foldTr, parseAmount, parseDate, parseInstallment } from "./normalize";
import type { ParsedTx, StatementSummary } from "./types";

export type TextItem = { str: string; x: number; y: number; width: number };

// pdf.js metin parçalarını aynı satırda (y yakın) olanları birleştirerek satırlara çevirir.
export function itemsToLines(items: TextItem[], tolerance = 2.5): string[] {
  const sorted = items
    .filter((i) => i.str.trim() !== "")
    .sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: TextItem[][] = [];
  for (const item of sorted) {
    const line = lines[lines.length - 1];
    if (line && Math.abs(line[0].y - item.y) <= tolerance) line.push(item);
    else lines.push([item]);
  }
  return lines.map((line) => {
    line.sort((a, b) => a.x - b.x);
    let out = "";
    let prevEnd = -Infinity;
    for (const it of line) {
      // Aradaki boşluk büyükse sütun ayrımı için iki boşluk bırakılır
      const gap = it.x - prevEnd;
      out += out === "" ? it.str : gap > 8 ? `  ${it.str}` : gap > 1 ? ` ${it.str}` : it.str;
      prevEnd = it.x + it.width;
    }
    return out.trim();
  });
}

const DATE_RE = /^(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{1,2}\s+[A-Za-zÇĞİÖŞÜçğıöşü]+\s+\d{4})/;
const AMOUNT_RE = /[-+]?\(?\d{1,3}(?:[.,]\d{3})*[.,]\d{2}\)?\s*(?:TL|₺)?\s*[-+]?/g;

// Tarihle başlayıp tutarla biten satırları işlem olarak okur. İşaret ekstrede nasıl yazıyorsa öyle döner.
export function parseStatementLines(lines: string[]): ParsedTx[] {
  const out: ParsedTx[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    const dm = line.match(DATE_RE);
    if (!dm) continue;
    const date = parseDate(dm[1]);
    if (!date) continue;
    const rest = line.slice(dm[0].length);
    const amounts = [...rest.matchAll(AMOUNT_RE)];
    if (!amounts.length) continue;
    const last = amounts[amounts.length - 1];
    // Tutar satırın sonunda olmalı (sonrasında en fazla puan/bonus gibi kısa bir ek)
    if (rest.length - (last.index! + last[0].length) > 12) continue;
    const amount = parseAmount(last[0]);
    if (amount === null || amount === 0) continue;
    // Açıklama: tarihten sonra, ilk tutardan önceki metin
    let description = rest.slice(0, amounts[0].index).replace(/\s+/g, " ").trim();
    // Açıklamanın başında ikinci bir tarih (valör) varsa at
    description = description.replace(DATE_RE, "").trim();
    if (!description) continue;
    const inst = parseInstallment(rest);
    out.push({
      date,
      description,
      amount,
      installmentNo: inst?.no ?? null,
      installmentTotal: inst?.total ?? null,
    });
  }
  return out;
}

function findAfter(text: string, labels: RegExp, value: RegExp): string | null {
  const m = text.match(new RegExp(`(?:${labels.source})[^0-9]{0,40}(${value.source})`));
  return m ? m[1] : null;
}

const D = /\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/;
const A = /[\d.]+,\d{2}/;

export function parseStatementSummary(lines: string[]): StatementSummary {
  const text = foldTr(lines.join("\n"));
  const statementDate = findAfter(text, /hesap kesim tarihi|kesim tarihi|ekstre tarihi|hesap ozeti tarihi/, D);
  const dueDate = findAfter(text, /son odeme tarihi/, D);
  const totalDue = findAfter(
    text,
    /donem borcu|hesap ozeti borcu|ekstre borcu|toplam borcunuz|odenmesi gereken tutar|guncel donem borcu/,
    A,
  );
  const minDue = findAfter(text, /asgari odeme tutari|asgari odeme/, A);
  return {
    statementDate: parseDate(statementDate),
    dueDate: parseDate(dueDate),
    totalDue: parseAmount(totalDue),
    minDue: parseAmount(minDue),
  };
}
