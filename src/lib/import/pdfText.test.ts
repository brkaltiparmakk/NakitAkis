import { describe, expect, it } from "vitest";
import { itemsToLines, parseStatementLines, parseStatementSummary } from "./pdfText";

describe("pdf text", () => {
  it("groups items into lines by y", () => {
    const lines = itemsToLines([
      { str: "15.09.2026", x: 10, y: 700, width: 40 },
      { str: "250,00", x: 400, y: 700.8, width: 30 },
      { str: "MIGROS", x: 80, y: 700, width: 30 },
      { str: "Son Ödeme Tarihi: 25.09.2026", x: 10, y: 750, width: 100 },
    ]);
    expect(lines).toEqual(["Son Ödeme Tarihi: 25.09.2026", "15.09.2026  MIGROS  250,00"]);
  });

  it("parses transaction lines", () => {
    const txs = parseStatementLines([
      "Hesap Kesim Tarihi 15.09.2026",
      "02.09.2026  MIGROS KADIKOY  1.250,40",
      "05.09.2026  TEKNOSA TAKSIT 2/6  3.000,00  12,50",
      "10.09.2026  ODEMENIZ ICIN TESEKKURLER  -5.000,00",
      "Sayfa 1 / 3",
    ]);
    expect(txs.map((t) => [t.date, t.description, t.amount])).toEqual([
      ["2026-09-02", "MIGROS KADIKOY", 1250.4],
      ["2026-09-05", "TEKNOSA TAKSIT 2/6", 12.5],
      ["2026-09-10", "ODEMENIZ ICIN TESEKKURLER", -5000],
    ]);
    expect(txs[1]).toMatchObject({ installmentNo: 2, installmentTotal: 6 });
  });

  it("reads statement summary fields", () => {
    const s = parseStatementSummary([
      "HESAP KESİM TARİHİ : 15.09.2026",
      "SON ÖDEME TARİHİ 25.09.2026",
      "Dönem Borcu 12.345,67 TL",
      "Asgari Ödeme Tutarı 2.469,13 TL",
    ]);
    expect(s).toEqual({ statementDate: "2026-09-15", dueDate: "2026-09-25", totalDue: 12345.67, minDue: 2469.13 });
  });
});
