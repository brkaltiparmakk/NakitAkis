import * as XLSX from "@e965/xlsx";
import type { Cell } from "./normalize";

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

// Bazı bankaların dosyaları (ör. Akbank) yanlış bir !ref aralığı bildirir; gerçek hücrelerden yeniden hesaplanır.
function fixRange(ws: XLSX.WorkSheet) {
  let maxR = 0;
  let maxC = 0;
  for (const key of Object.keys(ws)) {
    if (key.startsWith("!")) continue;
    const c = XLSX.utils.decode_cell(key);
    if (c.r > maxR) maxR = c.r;
    if (c.c > maxC) maxC = c.c;
  }
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxR, c: maxC } });
}

export function readSpreadsheet(buf: Uint8Array): Cell[][] {
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  // Birden çok sayfa varsa en çok satırı olan sayfa alınır
  let best: Cell[][] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    fixRange(ws);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: false,
    });
    if (rows.length > best.length) best = rows.map((r) => r.map(toCell));
  }
  return best;
}
