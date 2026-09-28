import "server-only";
import { getDocumentProxy } from "unpdf";
import { readSpreadsheet } from "./spreadsheet";
import { itemsToLines, parseStatementLines, parseStatementSummary, type TextItem } from "./pdfText";
import { decodeText, detectHolderName, headerLines, parseCsv, suggestMapping } from "./tabular";
import type { ImportPreview } from "./types";

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
  const mapping = suggestMapping(rows, isCard);
  const headerRow = mapping?.headerRow ?? -1;
  return {
    kind: "table",
    fileName,
    rows,
    mapping,
    summary: parseStatementSummary(headerLines(rows, headerRow)),
    holderName: detectHolderName(rows, headerRow),
  };
}
