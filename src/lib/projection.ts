import {
  type ISODate,
  addDays,
  dateInMonth,
  isoWeekday,
  nextMonthlyDate,
  toDate,
} from "@/lib/dates";
import { round2 } from "@/lib/money";

// Kart ve KMH faizine eklenen KKDF (%15) + BSMV (%15)
export const TAX_FACTOR = 1.3;
export const CASH_ACCOUNT = "__nakit";

export type CheckingInput = { id: string; name: string; balance: number; kmhMonthlyRate: number };

export type CardInput = {
  id: string;
  name: string;
  statementDay: number;
  dueDay: number;
  minRate: number;
  monthlyRate: number;
  paymentMode: "minimum" | "full";
  expectedMonthlySpend: number;
  payFromAccountId: string | null;
  latestStatement: { statementDate: ISODate; dueDate: ISODate; totalDue: number; minDue: number } | null;
  // Son ekstreden sonra yapılmış, henüz ekstreye girmemiş harcama (pozitif)
  unbilledSpend: number;
  // Henüz ekstrelere yansımamış gelecek taksitler (pozitif tutar, kalan adet).
  // startCycle: taksitin ilk yansıyacağı gelecek ekstre (1 = bir sonraki ekstre)
  installments: { amount: number; remaining: number; startCycle?: number }[];
};

export type RecurringInput = {
  name: string;
  amount: number;
  direction: "in" | "out";
  frequency: "monthly" | "weekly" | "yearly";
  dayOfMonth: number | null;
  dayOfWeek: number | null;
  monthOfYear: number | null;
  startDate: ISODate;
  endDate: ISODate | null;
  accountId: string | null;
  category: string | null;
};

export type LoanInput = {
  name: string;
  installmentAmount: number;
  nextPaymentDate: ISODate;
  remainingInstallments: number;
  accountId: string | null;
};

export type ProjEvent = {
  date: ISODate;
  label: string;
  amount: number;
  kind: "recurring" | "loan" | "card" | "kmh";
  category: string;
  accountId: string;
};

export type CardCycle = {
  statementDate: ISODate;
  dueDate: ISODate;
  statement: number;
  payment: number;
  carried: number;
  interest: number;
  actual: boolean;
};

export type ProjectionResult = {
  events: ProjEvent[];
  days: { date: ISODate; total: number; byAccount: Record<string, number> }[];
  cards: { id: string; name: string; cycles: CardCycle[] }[];
  lowest: { date: ISODate; total: number } | null;
};

export type ProjectionInput = {
  today: ISODate;
  horizon: ISODate;
  checking: CheckingInput[];
  cards: CardInput[];
  recurring: RecurringInput[];
  loans: LoanInput[];
};

export function expandRecurring(r: RecurringInput, from: ISODate, to: ISODate): ISODate[] {
  const start = r.startDate > from ? r.startDate : from;
  const end = r.endDate && r.endDate < to ? r.endDate : to;
  const out: ISODate[] = [];
  if (start > end) return out;
  if (r.frequency === "weekly") {
    const dow = r.dayOfWeek ?? isoWeekday(r.startDate);
    let d = addDays(start, (dow - isoWeekday(start) + 7) % 7);
    for (; d <= end; d = addDays(d, 7)) if (d > from) out.push(d);
    return out;
  }
  const day = r.dayOfMonth ?? Number(r.startDate.slice(8, 10));
  const s = toDate(start);
  for (let i = 0; ; i++) {
    const d = dateInMonth(s.getUTCFullYear(), s.getUTCMonth() + i, day);
    if (d > end) break;
    if (d < start || d <= from) continue;
    if (r.frequency === "yearly") {
      const month = r.monthOfYear ?? Number(r.startDate.slice(5, 7));
      if (Number(d.slice(5, 7)) !== month) continue;
    }
    out.push(d);
  }
  return out;
}

export function projectCard(c: CardInput, today: ISODate, horizon: ISODate): { cycles: CardCycle[]; events: Omit<ProjEvent, "accountId">[] } {
  const cycles: CardCycle[] = [];
  const events: Omit<ProjEvent, "accountId">[] = [];
  const payOf = (statement: number) =>
    round2(c.paymentMode === "full" ? statement : Math.min(statement, statement * c.minRate));

  let carried = 0;
  let cursor = today;
  const s = c.latestStatement;
  if (s) {
    const payment = c.paymentMode === "full" ? s.totalDue : s.minDue;
    carried = round2(Math.max(0, s.totalDue - payment));
    cycles.push({
      statementDate: s.statementDate,
      dueDate: s.dueDate,
      statement: s.totalDue,
      payment,
      carried,
      interest: 0,
      actual: true,
    });
    if (s.dueDate > today && payment > 0) {
      events.push({ date: s.dueDate, label: `${c.name} ekstre ödemesi`, amount: -payment, kind: "card", category: "Kart Ödemesi" });
    }
    if (s.statementDate > cursor) cursor = s.statementDate;
  }

  for (let k = 1; k <= 60; k++) {
    const statementDate = nextMonthlyDate(cursor, c.statementDay);
    if (statementDate > horizon) break;
    cursor = statementDate;
    const interest = round2(carried * c.monthlyRate * TAX_FACTOR);
    const installments = c.installments
      .filter((i) => k >= (i.startCycle ?? 1) && k < (i.startCycle ?? 1) + i.remaining)
      .reduce((a, i) => a + i.amount, 0);
    const spend = k === 1 ? Math.max(c.unbilledSpend, c.expectedMonthlySpend) : c.expectedMonthlySpend;
    const statement = round2(carried + interest + installments + spend);
    const payment = payOf(statement);
    const dueDate = nextMonthlyDate(statementDate, c.dueDay);
    carried = round2(statement - payment);
    cycles.push({ statementDate, dueDate, statement, payment, carried, interest, actual: false });
    if (dueDate <= horizon && payment > 0) {
      events.push({ date: dueDate, label: `${c.name} ekstre ödemesi (tahmini)`, amount: -payment, kind: "card", category: "Kart Ödemesi" });
    }
  }
  return { cycles, events };
}

export function project(input: ProjectionInput): ProjectionResult {
  const { today, horizon } = input;
  const checking = input.checking.length
    ? input.checking
    : [{ id: CASH_ACCOUNT, name: "Nakit", balance: 0, kmhMonthlyRate: 0 }];
  const ids = new Set(checking.map((a) => a.id));
  const defaultAccount = checking[0].id;
  const acc = (id: string | null) => (id && ids.has(id) ? id : defaultAccount);

  const events: ProjEvent[] = [];
  for (const r of input.recurring) {
    for (const date of expandRecurring(r, today, horizon)) {
      events.push({
        date,
        label: r.name,
        amount: r.direction === "in" ? r.amount : -r.amount,
        kind: "recurring",
        category: r.category ?? (r.direction === "in" ? "Diğer Gelir" : "Diğer Gider"),
        accountId: acc(r.accountId),
      });
    }
  }
  for (const l of input.loans) {
    const day = Number(l.nextPaymentDate.slice(8, 10));
    const first = toDate(l.nextPaymentDate);
    for (let i = 0; i < l.remainingInstallments; i++) {
      const date = dateInMonth(first.getUTCFullYear(), first.getUTCMonth() + i, day);
      if (date > horizon) break;
      if (date <= today) continue;
      events.push({
        date,
        label: `${l.name} taksidi (${i + 1}/${l.remainingInstallments})`,
        amount: -l.installmentAmount,
        kind: "loan",
        category: "Kredi Taksidi",
        accountId: acc(l.accountId),
      });
    }
  }
  const cards: ProjectionResult["cards"] = [];
  for (const c of input.cards) {
    const r = projectCard(c, today, horizon);
    cards.push({ id: c.id, name: c.name, cycles: r.cycles });
    for (const e of r.events) events.push({ ...e, accountId: acc(c.payFromAccountId) });
  }

  // Günlük bakiye simülasyonu + KMH faizi (eksi bakiyeye günlük tahakkuk, ay sonunda tahsil)
  const byDate = new Map<ISODate, ProjEvent[]>();
  for (const e of events) {
    const list = byDate.get(e.date) ?? [];
    list.push(e);
    byDate.set(e.date, list);
  }
  const bal: Record<string, number> = Object.fromEntries(checking.map((a) => [a.id, a.balance]));
  const accrued: Record<string, number> = Object.fromEntries(checking.map((a) => [a.id, 0]));
  const days: ProjectionResult["days"] = [];
  let lowest: ProjectionResult["lowest"] = null;

  for (let d = addDays(today, 1); d <= horizon; d = addDays(d, 1)) {
    for (const e of byDate.get(d) ?? []) bal[e.accountId] = round2(bal[e.accountId] + e.amount);
    for (const a of checking) {
      if (bal[a.id] < 0 && a.kmhMonthlyRate > 0) {
        accrued[a.id] += (-bal[a.id] * a.kmhMonthlyRate * TAX_FACTOR) / 30;
      }
    }
    const isMonthEnd = addDays(d, 1).slice(8, 10) === "01";
    if (isMonthEnd) {
      for (const a of checking) {
        const interest = round2(accrued[a.id]);
        if (interest > 0) {
          const e: ProjEvent = { date: d, label: `${a.name} KMH faizi (tahmini)`, amount: -interest, kind: "kmh", category: "Faiz / Masraf", accountId: a.id };
          events.push(e);
          bal[a.id] = round2(bal[a.id] - interest);
        }
        accrued[a.id] = 0;
      }
    }
    const total = round2(Object.values(bal).reduce((x, y) => x + y, 0));
    days.push({ date: d, total, byAccount: { ...bal } });
    if (!lowest || total < lowest.total) lowest = { date: d, total };
  }

  const future = events.filter((e) => e.date > today && e.date <= horizon);
  future.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { events: future, days, cards, lowest };
}
