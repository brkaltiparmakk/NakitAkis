// Gerçek banka dosyalarının yapısını taklit eden sahte verilerle testler (kişisel veri içermez).
import * as XLSX from "@e965/xlsx";
import { describe, expect, it } from "vitest";
import { categorize, categoryFromBankLabel, holderPattern, suggestPattern } from "../categorize";
import { projectCard } from "../projection";
import { parseStatementSummary } from "./pdfText";
import { readSpreadsheet } from "./spreadsheet";
import { applyMapping, decodeText, detectHolderName, headerLines, parseCsv, suggestMapping } from "./tabular";

// Windows-1254 (Türkçe) kodlaması: Akbank CSV'leri bu kodlamayla gelir
const CP1254: Record<string, number> = { Ç: 0xc7, ç: 0xe7, Ğ: 0xd0, ğ: 0xf0, İ: 0xdd, ı: 0xfd, Ö: 0xd6, ö: 0xf6, Ş: 0xde, ş: 0xfe, Ü: 0xdc, ü: 0xfc };
function encode1254(s: string): Uint8Array {
  return new Uint8Array([...s].map((ch) => CP1254[ch] ?? ch.charCodeAt(0)));
}

describe("Akbank vadesiz (xlsx)", () => {
  const aoa = [
    ["Ad Soyad/Unvan", "AYSE YILMAZ"],
    ["Hesap No", "0000 - 0000000 TL"],
    ["Kullanılabilir Bakiye", "-1.000,00 TL"],
    ["Tarih", "Saat", "Tutar", "Bakiye", "Açıklama", "Fiş/Dekont No"],
    ["27.09.2026", "00:31", -17, -1000, "062 BURGER KING          TEMASSIZ XXXX 1206", "1"],
    ["26.09.2026", "08:36", -120, -983, "012 A L P E T            TEMASSIZ XXXX 1206", "2"],
    ["23.09.2026", "13:16", -3000, -863, "7777/MBL-1111111-AYSE YILMAZ-", "3"],
  ];

  it("reads all rows even when the file declares a too-small range", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Sheet1");
    // Akbank dosyalarındaki gibi sayfa XML'inde hatalı <dimension ref> bildir
    const zip = XLSX.CFB.read(new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer), { type: "array" });
    const path = zip.FullPaths.find((p: string) => p.endsWith("worksheets/sheet1.xml"))!;
    const entry = XLSX.CFB.find(zip, path)!;
    const xml = new TextDecoder().decode(entry.content as Uint8Array).replace(/<dimension ref="[^"]+"/, '<dimension ref="B1:C3"');
    entry.content = new TextEncoder().encode(xml);
    const buf = XLSX.CFB.write(zip, { fileType: "zip", type: "array" }) as number[];
    expect(XLSX.read(new Uint8Array(buf), { type: "array" }).Sheets.Sheet1["!ref"]).toBe("B1:C3");
    const rows = readSpreadsheet(new Uint8Array(buf));
    expect(rows).toHaveLength(aoa.length);

    const m = suggestMapping(rows, false)!;
    expect(m).toMatchObject({ headerRow: 3, date: 0, amount: 2, balance: 3, description: 4, invertSign: false });
    const r = applyMapping(rows, m);
    expect(r.transactions).toHaveLength(3);
    expect(r.balanceAnchor).toEqual({ date: "2026-09-27", amount: -1000 });
    expect(detectHolderName(rows, m.headerRow)).toBe("AYSE YILMAZ");
  });

  it("categorizes spaced-out merchant names and own transfers", () => {
    const rules = [
      { pattern: "alpet", categoryId: "yakit" },
      { pattern: holderPattern("AYSE YILMAZ")!, categoryId: "transfer" },
    ];
    expect(categorize("012 A L P E T            TEMASSIZ XXXX 1206", rules)).toBe("yakit");
    expect(categorize("7777/MBL-1111111-AYSE YILMAZ-", rules)).toBe("transfer");
    // Garanti adı kırpar: "AYSE YILMA"
    expect(categorize("CEP ŞUBE-HVL- -AYSE YILMA", rules)).toBe("transfer");
    expect(categorize("CEP ŞUBE-HVL- -MEHMET YILMAZ", rules)).toBeNull();
    expect(suggestPattern("012 A L P E T            TEMASSIZ XXXX 1206")).toBe("alpet");
  });

  it("matches keywords only at word starts", () => {
    const rules = [{ pattern: "bim", categoryId: "market" }];
    expect(categorize("BIM BIRLESIK MAGAZALAR", rules)).toBe("market");
    expect(categorize("IBIM LTD", rules)).toBeNull();
  });
});

describe("Garanti", () => {
  it("vadesiz: uses the Etiket column as a category fallback", () => {
    const rows = [
      ["Ad Soyad", "AYSE YILMAZ"],
      ["Bakiye", "-4.321,00 TL"],
      ["Tarih", "Açıklama", "Etiket", "Tutar", "Bakiye", "Dekont No"],
      ["23/09/2026", "0020-0000-BonusFlaş Ödeme", "Kart Ödemesi", -2500, -4321, "x"],
      ["21/09/2026", "D4-(BİREYSEL AMAÇLI KREDİ TAHS.) REFERANS:1", "Kredi", -5000, -1821, "y"],
    ];
    const m = suggestMapping(rows, false)!;
    expect(m).toMatchObject({ headerRow: 2, label: 2, amount: 3, balance: 4 });
    const txs = applyMapping(rows, m).transactions;
    expect(txs.map((t) => t.label)).toEqual(["Kart Ödemesi", "Kredi"]);
    expect(categoryFromBankLabel("Kart Ödemesi")).toBe("Kart Ödemesi");
    expect(categoryFromBankLabel("Emeklilik/Sigorta")).toBe("Sigorta / BES");
    expect(categoryFromBankLabel("Yeme / İçme")).toBe("Restoran / Kafe");
    expect(categoryFromBankLabel("Para Transferi")).toBeNull();
  });

  it("kart dönem içi: keeps negative spending as is and skips section rows", () => {
    const rows = [
      ["Açık Provizyon - TL", null, null, null, null],
      ["Tarih", "İşlem", "Etiket", "Bonus", "Tutar(TL)"],
      ["28/09/2026", "APPLE.COM/BILL CORK", "", "", "-159,99"],
      [null, null, null, "Toplam Açık Provizyon:", "159,99"],
      ["Dönemiçi İşlemler - TL", null, null, null, null],
      ["Tarih", "İşlem", "Etiket", "Bonus", "Tutar(TL)"],
      ["07/09/2026", "Cep Şube Ödeme ", "Kart Ödemesi", "", "1.000,00"],
      ["06/09/2026", "EUREKO- 0001 (2/9) İSTANBUL", "Emeklilik/Sigorta", "", "-100,00"],
      ["03/09/2026", "IYZICO      *AMAZON.COM.T İSTANBUL", "Market", "20,89", "-4.000,00"],
      [null, null, null, "Toplam Harcama:", "3.259,99"],
    ];
    const m = suggestMapping(rows, true)!;
    expect(m).toMatchObject({ headerRow: 1, date: 0, description: 1, label: 2, amount: 4, invertSign: false });
    const r = applyMapping(rows, m);
    expect(r.transactions.map((t) => t.amount)).toEqual([-159.99, 1000, -100, -4000]);
    expect(r.transactions[2]).toMatchObject({ installmentNo: 2, installmentTotal: 9 });
  });
});

describe("Akbank kart (csv, windows-1254)", () => {
  const text = [
    "Kart Türü / No:;Axess / **** **** **** 0000;",
    "Hesap Kesim Tarihi;30.08.2026;",
    "Ekstre Borcu;12.345,60 TL;",
    "Asgari Ödeme Tutarı;0,00 TL;",
    "Son Ödeme Tarihi;09.09.2026;",
    "Tarih;Açıklama;Tutar;Chip Para / Mil;",
    "03.08.2026;GETMOBİL                         (06/12);150,00 TL;0 TL / 0;",
    "08.08.2026;HEPSİPAY/HEPSIPAY HEPSIBU        (06/09);800,00 TL;0 TL / 0;",
    "08.08.2026;HEPSİPAY/HEPSIPAY HEPSIBU        (06/09);800,00 TL;0 TL / 0;",
    "10.08.2026;İNTERNET Şb-Ödemeniz için Teşekkürler;-2.000,00 TL;0 TL / 0;",
    "",
    "Akbank T.A.Ş.",
  ].join("\r\n");

  it("decodes, detects inversion and reads the statement summary above the table", () => {
    const rows = parseCsv(decodeText(encode1254(text)));
    expect(rows[3][0]).toBe("Asgari Ödeme Tutarı");
    const m = suggestMapping(rows, true)!;
    expect(m).toMatchObject({ headerRow: 5, date: 0, description: 1, amount: 2, invertSign: true });
    const r = applyMapping(rows, m);
    expect(r.transactions.map((t) => t.amount)).toEqual([-150, -800, -800, 2000]);
    expect(r.transactions[0]).toMatchObject({ installmentNo: 6, installmentTotal: 12 });
    expect(parseStatementSummary(headerLines(rows, m.headerRow))).toEqual({
      statementDate: "2026-08-30",
      dueDate: "2026-09-09",
      totalDue: 12345.6,
      minDue: 0,
    });
  });

  it("treats a zero minimum as an already-paid statement", () => {
    const r = projectCard(
      {
        id: "k", name: "Axess", statementDay: 30, dueDay: 9, minRate: 0.4, monthlyRate: 0.0425, paymentMode: "minimum",
        expectedMonthlySpend: 0, payFromAccountId: null, unbilledSpend: 0, installments: [],
        latestStatement: { statementDate: "2026-08-30", dueDate: "2026-09-09", totalDue: 12345.6, minDue: 0 },
      },
      "2026-09-05",
      "2026-10-31",
    );
    expect(r.events).toEqual([]);
    expect(r.cycles[0].carried).toBe(0);
  });
});
