import { describe, expect, it } from "vitest";
import { dedupeKey, foldTr, parseAmount, parseDate, parseInstallment } from "./normalize";

describe("parseAmount", () => {
  it.each([
    ["1.234,56", 1234.56],
    ["-1.234,56", -1234.56],
    ["1.234,56-", -1234.56],
    ["(250,00)", -250],
    ["1,234.56", 1234.56],
    ["1234.56", 1234.56],
    ["12,5", 12.5],
    ["1.234", 1234],
    ["1.234.567,89 TL", 1234567.89],
    ["+45,00 ₺", 45],
    [" 0,99 ", 0.99],
  ])("%s → %d", (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it("rejects text", () => {
    expect(parseAmount("Devreden bakiye")).toBeNull();
    expect(parseAmount("")).toBeNull();
    expect(parseAmount(null)).toBeNull();
  });

  it("keeps numbers", () => {
    expect(parseAmount(-12.345)).toBe(-12.35);
  });
});

describe("parseDate", () => {
  it.each([
    ["15.09.2026", "2026-09-15"],
    ["5/9/2026", "2026-09-05"],
    ["15.09.26", "2026-09-15"],
    ["2026-09-15", "2026-09-15"],
    ["15.09.2026 14:32", "2026-09-15"],
    ["15 Eylül 2026", "2026-09-15"],
    ["3 AĞUSTOS 2026", "2026-08-03"],
  ])("%s → %s", (input, expected) => {
    expect(parseDate(input)).toBe(expected);
  });

  it("rejects invalid", () => {
    expect(parseDate("31.02.2026")).toBeNull();
    expect(parseDate("Tarih")).toBeNull();
  });

  it("reads excel serials", () => {
    expect(parseDate(46280)).toBe("2026-09-15");
  });
});

describe("parseInstallment", () => {
  it.each([
    ["MIGROS TAKSİT 2/6", { no: 2, total: 6 }],
    ["TEKNOSA 3/12 TAKSIT", { no: 3, total: 12 }],
    ["MEDIAMARKT (1/9)", { no: 1, total: 9 }],
    ["BOYNER 2.TAKSIT/4", { no: 2, total: 4 }],
  ])("%s", (input, expected) => {
    expect(parseInstallment(input)).toEqual(expected);
  });

  it("ignores non-installment slashes", () => {
    expect(parseInstallment("HAVALE 12/05 KIRA")).toBeNull();
  });
});

describe("foldTr & dedupeKey", () => {
  it("folds Turkish characters", () => {
    expect(foldTr("İŞLEM AÇIKLAMASI Ğüç")).toBe("islem aciklamasi guc");
  });
  it("is insensitive to spacing and case", () => {
    expect(dedupeKey("2026-09-01", -10, "MIGROS  KADIKÖY")).toBe(dedupeKey("2026-09-01", -10, "migros kadikoy"));
  });
});
