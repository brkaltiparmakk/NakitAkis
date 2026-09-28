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
