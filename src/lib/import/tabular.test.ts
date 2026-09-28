import { describe, expect, it } from "vitest";
import { applyMapping, parseCsv, suggestMapping } from "./tabular";

const rows = [
  ["Hesap Hareketleri", null, null, null],
  ["Müşteri: ***", null, null, null],
  ["Tarih", "Açıklama", "Tutar", "Bakiye"],
  ["16.09.2026", "MIGROS KADIKOY", "-450,20", "9.549,80"],
  ["16.09.2026", "MAAS ODEMESI", "40.000,00", "49.549,80"],
  ["15.09.2026", "ENERJISA", "-1.200,00", "10.000,00"],
  ["Toplam", null, null, null],
];

describe("tabular import", () => {
  it("detects header and columns", () => {
    const m = suggestMapping(rows, false);
    expect(m).toMatchObject({ headerRow: 2, date: 0, description: 1, amount: 2, balance: 3, invertSign: false });
  });

  it("maps rows and picks the latest balance respecting file order", () => {
    const res = applyMapping(rows, suggestMapping(rows, false)!);
    expect(res.transactions).toHaveLength(3);
    expect(res.transactions[1]).toMatchObject({ date: "2026-09-16", amount: 40000, description: "MAAS ODEMESI" });
    expect(res.skippedRows).toBe(1);
    // Dosya azalan sıralı: 16.09'un ilk satırı en güncel bakiyedir
    expect(res.balanceAnchor).toEqual({ date: "2026-09-16", amount: 9549.8 });
  });

  it("handles separate debit/credit columns and inversion", () => {
    const r = [
      ["İşlem Tarihi", "İşlem", "Borç", "Alacak"],
      ["01.09.2026", "A101", "100,00", ""],
      ["02.09.2026", "İADE", "", "20,00"],
    ];
    const m = suggestMapping(r, false)!;
    expect(m).toMatchObject({ debit: 2, credit: 3, amount: undefined });
    expect(applyMapping(r, m).transactions.map((t) => t.amount)).toEqual([-100, 20]);
    expect(applyMapping(r, { ...m, invertSign: true }).transactions.map((t) => t.amount)).toEqual([100, -20]);
  });

  it("parses semicolon CSV with quotes", () => {
    const csv = 'Tarih;Açıklama;Tutar\r\n01.09.2026;"KIRA; EYLUL";-15.000,00\r\n';
    expect(parseCsv(csv)).toEqual([
      ["Tarih", "Açıklama", "Tutar"],
      ["01.09.2026", "KIRA; EYLUL", "-15.000,00"],
    ]);
  });
});
