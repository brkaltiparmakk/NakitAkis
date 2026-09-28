import "server-only";
import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Account } from "@/db/schema";
import { balanceAt, type Flow } from "@/lib/cashflow";
import { INTERNAL_TRANSFER } from "@/lib/categorize";
import { addDays, type ISODate } from "@/lib/dates";
import { foldTr } from "@/lib/import/normalize";
import { round2, toNum } from "@/lib/money";
import type { CardInput, ProjectionInput } from "@/lib/projection";

export async function getAccounts(userId: string) {
  return db()
    .select()
    .from(schema.accounts)
    .where(and(eq(schema.accounts.userId, userId), eq(schema.accounts.archived, false)))
    .orderBy(asc(schema.accounts.type), asc(schema.accounts.createdAt));
}

export async function getCategories(userId: string) {
  return db()
    .select()
    .from(schema.categories)
    .where(eq(schema.categories.userId, userId))
    .orderBy(asc(schema.categories.kind), asc(schema.categories.name));
}

export function anchorOf(a: Account) {
  return a.balanceDate ? { date: a.balanceDate, amount: toNum(a.balanceAmount) } : null;
}

async function txsForAccounts(ids: string[]) {
  if (!ids.length) return [];
  const rows = await db()
    .select({ accountId: schema.transactions.accountId, date: schema.transactions.date, amount: schema.transactions.amount, categoryId: schema.transactions.categoryId, description: schema.transactions.description, installmentNo: schema.transactions.installmentNo, installmentTotal: schema.transactions.installmentTotal })
    .from(schema.transactions)
    .where(inArray(schema.transactions.accountId, ids));
  return rows.map((r) => ({ ...r, amount: toNum(r.amount) }));
}

export type CheckingSnapshot = { account: Account; balance: number };
export type CardSnapshot = {
  account: Account;
  latest: { statementDate: string; dueDate: string; totalDue: number; minDue: number } | null;
  unbilledSpend: number;
  installments: { label: string; amount: number; remaining: number; startCycle: number }[];
};

// Hesapların bugünkü durumu: vadesiz bakiyeleri, kartların son ekstresi, dönem içi harcama ve kalan taksitler
export async function snapshot(userId: string, today: ISODate) {
  const accounts = await getAccounts(userId);
  const checkingAccs = accounts.filter((a) => a.type === "checking");
  const cardAccs = accounts.filter((a) => a.type === "credit_card");
  const txs = await txsForAccounts(accounts.map((a) => a.id));

  const checking: CheckingSnapshot[] = checkingAccs.map((a) => ({
    account: a,
    balance: balanceAt(anchorOf(a), txs.filter((t) => t.accountId === a.id), today),
  }));

  const statements = cardAccs.length
    ? await db()
        .select()
        .from(schema.cardStatements)
        .where(inArray(schema.cardStatements.accountId, cardAccs.map((a) => a.id)))
        .orderBy(desc(schema.cardStatements.statementDate))
    : [];

  const cards: CardSnapshot[] = cardAccs.map((a) => {
    const s = statements.find((x) => x.accountId === a.id);
    const latest = s
      ? { statementDate: s.statementDate, dueDate: s.dueDate, totalDue: toNum(s.totalDue), minDue: toNum(s.minDue) }
      : null;
    const cutoff = latest?.statementDate ?? addDays(today, -30);
    const own = txs.filter((t) => t.accountId === a.id);
    const unbilledSpend = round2(own.filter((t) => t.date > cutoff && t.amount < 0).reduce((x, t) => x - t.amount, 0));

    // Aynı taksitli alışverişin farklı ekstrelerdeki satırları gruplanır, en son görülen taksit no'su alınır
    const groups = new Map<string, { label: string; amount: number; total: number; maxNo: number; lastDate: string }>();
    for (const t of own) {
      if (!t.installmentNo || !t.installmentTotal || t.amount >= 0) continue;
      const base = foldTr(t.description).replace(/\d+\s*[./]?\s*(taksit)?\s*\/\s*\d+|taksit|\(|\)/g, "").replace(/\s+/g, " ").trim();
      const key = `${base}|${Math.abs(t.amount)}|${t.installmentTotal}`;
      const g = groups.get(key);
      if (!g || t.installmentNo > g.maxNo) {
        groups.set(key, { label: t.description, amount: -t.amount, total: t.installmentTotal, maxNo: t.installmentNo, lastDate: t.date });
      }
    }
    const installments = [...groups.values()]
      .filter((g) => g.maxNo < g.total && g.lastDate > addDays(today, -70))
      .map((g) => ({
        label: g.label,
        amount: g.amount,
        remaining: g.total - g.maxNo,
        // Son görülen taksit henüz ekstreye girmediyse bir sonraki ekstrede o taksit zaten dönem harcamasında sayılır
        startCycle: g.lastDate > cutoff ? 2 : 1,
      }));
    return { account: a, latest, unbilledSpend, installments };
  });

  return { accounts, checking, cards, txs };
}

export async function projectionInput(userId: string, today: ISODate, horizon: ISODate): Promise<ProjectionInput & { snap: Awaited<ReturnType<typeof snapshot>> }> {
  const snap = await snapshot(userId, today);
  const [recurring, loans, categories] = await Promise.all([
    db().select().from(schema.recurringItems).where(and(eq(schema.recurringItems.userId, userId), eq(schema.recurringItems.active, true))),
    db().select().from(schema.loans).where(eq(schema.loans.userId, userId)),
    getCategories(userId),
  ]);
  const catName = new Map(categories.map((c) => [c.id, c.name]));

  const cards: CardInput[] = snap.cards.map(({ account: a, latest, unbilledSpend, installments }) => ({
    id: a.id,
    name: a.name,
    statementDay: a.statementDay ?? 1,
    dueDay: a.dueDay ?? 10,
    minRate: a.minPaymentRate ? toNum(a.minPaymentRate) : 0.2,
    monthlyRate: a.cardMonthlyRate ? toNum(a.cardMonthlyRate) : 0,
    paymentMode: a.paymentMode === "full" ? "full" : "minimum",
    expectedMonthlySpend: toNum(a.expectedMonthlySpend),
    payFromAccountId: a.payFromAccountId,
    latestStatement: latest,
    unbilledSpend,
    installments,
  }));

  return {
    snap,
    today,
    horizon,
    checking: snap.checking.map(({ account: a, balance }) => ({
      id: a.id,
      name: a.name,
      balance,
      kmhMonthlyRate: toNum(a.kmhMonthlyRate),
    })),
    cards,
    recurring: recurring.map((r) => ({
      name: r.name,
      amount: toNum(r.amount),
      direction: r.direction === "in" ? "in" : "out",
      frequency: r.frequency as "monthly" | "weekly" | "yearly",
      dayOfMonth: r.dayOfMonth,
      dayOfWeek: r.dayOfWeek,
      monthOfYear: r.monthOfYear,
      startDate: r.startDate,
      endDate: r.endDate,
      accountId: r.accountId,
      category: r.categoryId ? (catName.get(r.categoryId) ?? null) : null,
    })),
    loans: loans.map((l) => ({
      name: l.name,
      installmentAmount: toNum(l.installmentAmount),
      nextPaymentDate: l.nextPaymentDate,
      remainingInstallments: l.remainingInstallments,
      accountId: l.accountId,
    })),
  };
}

// Vadesiz hesaplardaki gerçekleşmiş hareketler (nakit akış tablosu için)
export async function checkingFlows(userId: string, start: ISODate, end: ISODate): Promise<Flow[]> {
  const rows = await db()
    .select({ date: schema.transactions.date, amount: schema.transactions.amount, category: schema.categories.name })
    .from(schema.transactions)
    .innerJoin(schema.accounts, eq(schema.accounts.id, schema.transactions.accountId))
    .leftJoin(schema.categories, eq(schema.categories.id, schema.transactions.categoryId))
    .where(
      and(
        eq(schema.transactions.userId, userId),
        eq(schema.accounts.type, "checking"),
        gte(schema.transactions.date, start),
        lte(schema.transactions.date, end),
      ),
    );
  return rows.map((r) => {
    const amount = toNum(r.amount);
    return {
      date: r.date,
      amount,
      category: r.category ?? (amount >= 0 ? "Kategorisiz giriş" : "Kategorisiz çıkış"),
      projected: false,
      internal: r.category === INTERNAL_TRANSFER,
    };
  });
}

// Harcama/gelir analizi: tüm hesaplar, transfer kategorileri hariç
export async function analysisRows(userId: string, start: ISODate, end: ISODate) {
  const rows = await db()
    .select({
      date: schema.transactions.date,
      amount: schema.transactions.amount,
      category: schema.categories.name,
      kind: schema.categories.kind,
      color: schema.categories.color,
    })
    .from(schema.transactions)
    .leftJoin(schema.categories, eq(schema.categories.id, schema.transactions.categoryId))
    .where(and(eq(schema.transactions.userId, userId), gte(schema.transactions.date, start), lte(schema.transactions.date, end)));
  return rows
    .filter((r) => r.kind !== "transfer")
    .map((r) => ({ ...r, amount: toNum(r.amount), category: r.category ?? "Kategorisiz", color: r.color ?? "#94a3b8" }));
}

export async function getRules(userId: string) {
  return db()
    .select({ pattern: schema.categoryRules.pattern, categoryId: schema.categoryRules.categoryId })
    .from(schema.categoryRules)
    .where(eq(schema.categoryRules.userId, userId));
}

