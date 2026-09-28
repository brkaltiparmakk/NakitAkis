import "server-only";
import * as XLSX from "@e965/xlsx";
import { getDocumentProxy } from "unpdf";
import type { Cell } from "./normalize";
import { itemsToLines, parseStatementLines, parseStatementSummary, type TextItem } from "./pdfText";
import { decodeText, parseCsv, suggestMapping } from "./tabular";
import type { ImportPreview } from "./types";

function toCell(v: unknown): Cell {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) {
    // SheetJS tarihleri yerel saatle üretir; gün bileşenleri doğrudan alınır
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof v === "number") return v;
  return String(v);
}

function readSpreadsheet(buf: Uint8Array): Cell[][] {
  const wb = XLSX.read(buf, { type: "array", cellDates: true, dense: true });
  // Birden çok sayfa varsa en çok satırı olan sayfa alınır
  let best: Cell[][] = [];
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], {
      header: 1,
      raw: true,
      defval: null,
      blankrows: false,
    });
    if (rows.length > best.length) best = rows.map((r) => r.map(toCell));
  }
  return best;
}

async function readPdfLines(buf: Uint8Array): Promise<string[]> {
  const pdf = await getDocumentProxy(buf);
  const lines: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const items: TextItem[] = [];
    for (const it of content.items) {
      if ("str" in it) {
        items.push({ str: it.str, x: it.transform[4], y: it.transform[5], width: it.width });
      }
    }
    lines.push(...itemsToLines(items));
  }
  return lines;
}

export async function readImportFile(
  fileName: string,
  buf: Uint8Array,
  isCard: boolean,
): Promise<ImportPreview> {
  const ext = fileName.toLowerCase().split(".").pop();
  if (ext === "pdf") {
    const lines = await readPdfLines(buf);
    return {
      kind: "pdf",
      fileName,
      lines,
      transactions: parseStatementLines(lines),
      summary: parseStatementSummary(lines),
    };
  }
  const rows = ext === "csv" || ext === "txt" ? parseCsv(decodeText(buf)) : readSpreadsheet(buf);
  // Kart ekstrelerinde harcamalar genelde pozitif yazılır; bizde harcama negatif olmalı
  return { kind: "table", fileName, rows, mapping: suggestMapping(rows, isCard) };
}
