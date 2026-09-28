import { describe, expect, it } from "vitest";
import { buildBuckets, balanceAt } from "./cashflow";
import { categorize, suggestPattern } from "./categorize";
import { planInserts } from "./import/dedupe";
import { expandRecurring, project, projectCard, type CardInput } from "./projection";

describe("planInserts", () => {
  it("skips rows already stored, keeps genuine repeats", () => {
    const rows = [{ key: "a" }, { key: "a" }, { key: "b" }, { key: "c" }];
    const { toInsert, skipped } = planInserts(rows, new Map([["a", 1], ["b", 1]]));
    expect(toInsert.map((r) => r.key)).toEqual(["a", "c"]);
    expect(skipped).toBe(2);
  });
});

describe("categorize", () => {
  const rules = [
    { pattern: "migros", categoryId: "market" },
    { pattern: "migros sanal", categoryId: "online" },
  ];
  it("prefers the longest match", () => {
    expect(categorize("MİGROS SANAL MARKET", rules)).toBe("online");
    expect(categorize("MIGROS KADIKÖY", rules)).toBe("market");
    expect(categorize("A101", rules)).toBeNull();
  });
  it("suggests a keyword", () => {
    expect(suggestPattern("MIGROS KADIKOY ISTANBUL TR 1234")).toBe("migros kadikoy");
  });
});

describe("balanceAt", () => {
  const txs = [
    { date: "2026-09-01", amount: -100 },
    { date: "2026-09-05", amount: 1000 },
    { date: "2026-09-10", amount: -50 },
  ];
  it("walks forwards and backwards from anchor", () => {
    const anchor = { date: "2026-09-05", amount: 2000 };
    expect(balanceAt(anchor, txs, "2026-09-05")).toBe(2000);
    expect(balanceAt(anchor, txs, "2026-09-10")).toBe(1950);
    expect(balanceAt(anchor, txs, "2026-09-04")).toBe(1000);
    expect(balanceAt(anchor, txs, "2026-08-31")).toBe(1100);
  });
});

describe("buildBuckets", () => {
  it("chains opening and closing balances", () => {
    const b = buildBuckets({
      start: "2026-09-01",
      end: "2026-10-31",
      granularity: "monthly",
      opening: 1000,
      today: "2026-09-28",
      flows: [
        { date: "2026-09-02", amount: 500, category: "Maaş", projected: false },
        { date: "2026-09-03", amount: -200, category: "Market", projected: false },
        { date: "2026-10-03", amount: -300, category: "Market", projected: true },
      ],
    });
    expect(b.map((x) => [x.opening, x.totalIn, x.totalOut, x.closing])).toEqual([
      [1000, 500, 200, 1300],
      [1300, 0, 300, 1000],
    ]);
    expect(b[0].projected).toBe(true);
    expect(b[1].outflows).toEqual({ Market: 300 });
  });
});

describe("buildBuckets internal transfers", () => {
  it("keeps own-account transfers out of inflows/outflows but in the balance", () => {
    const [b] = buildBuckets({
      start: "2026-09-01",
      end: "2026-09-30",
      granularity: "monthly",
      opening: 0,
      today: "2026-09-28",
      flows: [
        { date: "2026-09-04", amount: -133000, category: "Hesaplar Arası Transfer", projected: false, internal: true },
        { date: "2026-09-04", amount: 133000, category: "Hesaplar Arası Transfer", projected: false, internal: true },
        { date: "2026-09-07", amount: 10000, category: "Hesaplar Arası Transfer", projected: false, internal: true },
        { date: "2026-09-07", amount: -2000, category: "Kart Ödemesi", projected: false },
      ],
    });
    expect(b.inflows).toEqual({});
    expect(b.outflows).toEqual({ "Kart Ödemesi": 2000 });
    expect([b.totalIn, b.totalOut, b.internalNet, b.net, b.closing]).toEqual([0, 2000, 10000, 8000, 8000]);
  });
});

describe("expandRecurring", () => {
  const base = { name: "x", amount: 1, direction: "out" as const, dayOfWeek: null, monthOfYear: null, endDate: null, accountId: null, category: null };
  it("monthly clamps to month end", () => {
    expect(expandRecurring({ ...base, frequency: "monthly", dayOfMonth: 31, startDate: "2026-01-01" }, "2026-09-28", "2026-11-30"))
      .toEqual(["2026-09-30", "2026-10-31", "2026-11-30"]);
  });
  it("weekly on a weekday", () => {
    // 2026-09-28 Pazartesi
    expect(expandRecurring({ ...base, frequency: "weekly", dayOfMonth: null, dayOfWeek: 5, startDate: "2026-01-01" }, "2026-09-28", "2026-10-10"))
      .toEqual(["2026-10-02", "2026-10-09"]);
  });
  it("yearly", () => {
    expect(expandRecurring({ ...base, frequency: "yearly", dayOfMonth: 15, monthOfYear: 1, startDate: "2025-01-15" }, "2026-09-28", "2028-01-31"))
      .toEqual(["2027-01-15", "2028-01-15"]);
  });
});

describe("projectCard (asgari ödeme)", () => {
  const card: CardInput = {
    id: "c", name: "Bonus", statementDay: 15, dueDay: 25, minRate: 0.2, monthlyRate: 0.04,
    paymentMode: "minimum", expectedMonthlySpend: 1000, payFromAccountId: null,
    latestStatement: { statementDate: "2026-09-15", dueDate: "2026-09-25", totalDue: 10000, minDue: 2000 },
    unbilledSpend: 300,
    installments: [{ amount: 500, remaining: 1 }],
  };
  it("carries the unpaid part with interest and taxes", () => {
    const r = projectCard(card, "2026-09-20", "2026-11-30");
    expect(r.events.map((e) => [e.date, e.amount])).toEqual([
      ["2026-09-25", -2000],
      ["2026-10-25", -1983.2],
      ["2026-11-25", -1869.06],
    ]);
    // Ekim: 8000 devir + 8000*0.04*1.3=416 faiz + 500 taksit + max(300,1000) harcama
    expect(r.cycles[1]).toMatchObject({ statementDate: "2026-10-15", interest: 416, statement: 9916, payment: 1983.2 });
  });
  it("full payment leaves no carry", () => {
    const r = projectCard({ ...card, paymentMode: "full" }, "2026-09-20", "2026-10-31");
    expect(r.cycles[1]).toMatchObject({ statement: 1500, payment: 1500, carried: 0 });
  });
});

describe("project", () => {
  it("simulates balances, loans and KMH interest", () => {
    const r = project({
      today: "2026-09-28",
      horizon: "2026-10-31",
      checking: [{ id: "a", name: "Vadesiz", balance: 1000, kmhMonthlyRate: 0.05 }],
      cards: [],
      recurring: [],
      loans: [{ name: "Konut", installmentAmount: 4000, nextPaymentDate: "2026-10-01", remainingInstallments: 100, accountId: null }],
    });
    expect(r.events.map((e) => [e.date, e.kind, e.amount])).toEqual([
      ["2026-10-01", "loan", -4000],
      ["2026-10-31", "kmh", -Math.round(3000 * 0.05 * 1.3 / 30 * 31 * 100) / 100],
    ]);
    expect(r.lowest?.date).toBe("2026-10-31");
  });
});

describe("daily spending", () => {
  it("averages full months and ignores loans, interest, installments and uncategorized on checking", async () => {
    const { averageMonthlySpend } = await import("./spending");
    const txs = [
      { date: "2026-05-20", amount: -999, kind: "expense", category: "Market" }, // pencere dışı
      { date: "2026-06-02", amount: -300, kind: "expense", category: "Market" },
      { date: "2026-07-10", amount: -600, kind: "expense", category: "Restoran / Kafe" },
      { date: "2026-08-05", amount: -900, kind: "expense", category: "Ulaşım / Yakıt" },
      { date: "2026-08-21", amount: -50000, kind: "expense", category: "Kredi Taksidi" },
      { date: "2026-08-31", amount: -5000, kind: "expense", category: "Faiz / Masraf" },
      { date: "2026-08-12", amount: -7000, kind: null, category: null },
      { date: "2026-08-12", amount: -800, kind: "expense", category: "Alışveriş", installmentNo: 2 },
      { date: "2026-09-10", amount: -123, kind: "expense", category: "Market" }, // içinde bulunulan ay sayılmaz
    ];
    expect(averageMonthlySpend(txs, "2026-09-28", { includeUncategorized: false })).toBe(600);
    expect(averageMonthlySpend(txs, "2026-09-28", { includeUncategorized: true })).toBe(round(600 + 7000 / 3));
  });

  it("falls back to the last 30 days when there is no full month", async () => {
    const { averageMonthlySpend } = await import("./spending");
    const txs = [
      { date: "2026-09-03", amount: -1000, kind: null, category: null },
      { date: "2026-09-20", amount: -500, kind: "expense", category: "Market" },
    ];
    expect(averageMonthlySpend(txs, "2026-09-28", { includeUncategorized: true })).toBe(1500);
  });

  it("nets refunds in expense categories", async () => {
    const { averageMonthlySpend } = await import("./spending");
    const txs = [
      { date: "2026-09-03", amount: -41779, kind: "expense", category: "Alışveriş" },
      { date: "2026-09-15", amount: 41779, kind: "expense", category: "Alışveriş" },
      { date: "2026-09-07", amount: 10612, kind: "transfer", category: "Kart Ödemesi" },
      { date: "2026-09-20", amount: -600, kind: "expense", category: "Restoran / Kafe" },
      // Eşi olmayan artı tutar (BES ödemesi gibi) harcamayı azaltmaz
      { date: "2026-09-21", amount: 30698.96, kind: "expense", category: "Sigorta / BES" },
      // Kategorisiz artılar (ör. gelen havale) sayılmaz
      { date: "2026-09-22", amount: 500, kind: null, category: null },
    ];
    expect(averageMonthlySpend(txs, "2026-09-28", { includeUncategorized: true })).toBe(600);
  });

  it("adds weekly spending events on Mondays", () => {
    const r = project({
      today: "2026-09-28",
      horizon: "2026-10-20",
      checking: [{ id: "a", name: "Vadesiz", balance: 0, kmhMonthlyRate: 0, monthlySpend: 5200 }],
      cards: [],
      recurring: [],
      loans: [],
    });
    expect(r.events.map((e) => [e.date, e.kind, e.amount])).toEqual([
      ["2026-10-05", "spend", -1200],
      ["2026-10-12", "spend", -1200],
      ["2026-10-19", "spend", -1200],
    ]);
  });
});

function round(n: number) {
  return Math.round(n * 100) / 100;
}

describe("findTransferPairs", () => {
  it("pairs opposite amounts across own accounts within a day", async () => {
    const { findTransferPairs } = await import("./transfers");
    const ids = findTransferPairs([
      { id: "g-out", accountId: "g", date: "2026-09-07", amount: -40000, categorized: "none" },
      { id: "a-in", accountId: "a", date: "2026-09-07", amount: 40000, categorized: "internal" },
      { id: "a-out", accountId: "a", date: "2026-08-04", amount: -133000, categorized: "internal" },
      { id: "g-in", accountId: "g", date: "2026-08-05", amount: 133000, categorized: "none" },
      // aynı hesap içinde ters işlem eşlenmez
      { id: "x1", accountId: "a", date: "2026-08-30", amount: -150, categorized: "none" },
      { id: "x2", accountId: "a", date: "2026-08-30", amount: 150, categorized: "none" },
      // 3 gün arayla: eşlenmez
      { id: "y1", accountId: "a", date: "2026-07-01", amount: -500, categorized: "none" },
      { id: "y2", accountId: "g", date: "2026-07-04", amount: 500, categorized: "none" },
      // küçük tutarlar eşlenmez
      { id: "z1", accountId: "a", date: "2026-07-01", amount: -50, categorized: "none" },
      { id: "z2", accountId: "g", date: "2026-07-01", amount: 50, categorized: "none" },
    ]);
    expect(ids.sort()).toEqual(["g-in", "g-out"]);
  });

  it("uses each transaction once", async () => {
    const { findTransferPairs } = await import("./transfers");
    const ids = findTransferPairs([
      { id: "o1", accountId: "a", date: "2026-09-01", amount: -1000, categorized: "none" },
      { id: "o2", accountId: "a", date: "2026-09-01", amount: -1000, categorized: "none" },
      { id: "i1", accountId: "g", date: "2026-09-01", amount: 1000, categorized: "none" },
    ]);
    expect(ids.sort()).toEqual(["i1", "o1"]);
  });
});
