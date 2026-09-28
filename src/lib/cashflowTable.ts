import "server-only";
import { balanceAt, buildBuckets, type Flow, type Granularity } from "@/lib/cashflow";
import { anchorOf, checkingFlows, projectionInput } from "@/lib/data";
import { addDays, addMonths, diffDays, startOfMonth, todayIso } from "@/lib/dates";
import { parseDate } from "@/lib/import/normalize";
import { round2, toNum } from "@/lib/money";
import { project } from "@/lib/projection";

export const VIEWS: Record<string, Granularity> = { gunluk: "daily", haftalik: "weekly", aylik: "monthly" };
const MAX_COLUMNS = { daily: 62, weekly: 60, monthly: 36 };

// Nakit akış tablosunun verisi: sayfa ve Excel çıktısı aynı hesabı kullanır
export async function cashflowTable(userId: string, sp: Record<string, string | undefined>) {
  const today = todayIso();
  const viewKey = sp.gorunum && VIEWS[sp.gorunum] ? sp.gorunum : "aylik";
  const g = VIEWS[viewKey];
  const defaults = {
    daily: [addDays(today, -14), addDays(today, 30)],
    weekly: [addDays(today, -8 * 7), addDays(today, 12 * 7)],
    monthly: [startOfMonth(addMonths(today, -3)), addDays(startOfMonth(addMonths(today, 7)), -1)],
  }[g];
  const start = parseDate(sp.baslangic ?? null) ?? defaults[0];
  let end = parseDate(sp.bitis ?? null) ?? defaults[1];
  if (end < start) end = start;
  const maxDays = { daily: MAX_COLUMNS.daily, weekly: MAX_COLUMNS.weekly * 7, monthly: MAX_COLUMNS.monthly * 31 }[g];
  const clamped = diffDays(start, end) > maxDays;
  if (clamped) end = addDays(start, maxDays);

  const input = await projectionInput(userId, today, end > today ? end : today);
  const accounts = input.snap.checking;
  const events = end > today ? project(input).events : [];
  // Başlangıçtan bir gün önceki toplam bakiye; başlangıç gelecekteyse aradaki tahmini hareketler eklenir
  const dayBefore = addDays(start, -1);
  const actualUntil = dayBefore < today ? dayBefore : today;
  const opening = round2(
    accounts.reduce(
      (sum, c) => sum + balanceAt(anchorOf(c.account), input.snap.txs.filter((t) => t.accountId === c.account.id), actualUntil),
      0,
    ) + events.filter((e) => e.date <= dayBefore).reduce((a, e) => a + e.amount, 0),
  );
  const actual = start <= today ? await checkingFlows(userId, start, end < today ? end : today) : [];
  const projected: Flow[] = events.map((e) => ({ date: e.date, amount: e.amount, category: e.category, projected: true }));
  const buckets = buildBuckets({ start, end, granularity: g, opening, flows: [...actual, ...projected], today });
  const inCats = [...new Set(buckets.flatMap((b) => Object.keys(b.inflows)))].sort();
  const outCats = [...new Set(buckets.flatMap((b) => Object.keys(b.outflows)))].sort();
  // Tarihi belirsiz alacak/borçlar tabloya girmez; "gelirse dönem sonu" satırı için net toplamları döner
  const undatedNet = round2(
    input.undatedReceivables.reduce((a, r) => a + (r.direction === "in" ? toNum(r.amount) : -toNum(r.amount)), 0),
  );
  return { viewKey, start, end, clamped, hasAccounts: accounts.length > 0, buckets, inCats, outCats, undatedNet };
}
