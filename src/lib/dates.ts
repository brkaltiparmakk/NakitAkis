// Tüm tarihler "YYYY-MM-DD" string'i olarak taşınır; hesaplar UTC üzerinde yapılır ki saat dilimi kaymasın.

export type ISODate = string;

export function toDate(d: ISODate): Date {
  return new Date(`${d}T00:00:00Z`);
}

export function fromDate(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function todayIso(): ISODate {
  // Türkiye saati (UTC+3) ile bugünün tarihi
  return fromDate(new Date(Date.now() + 3 * 3600 * 1000));
}

export function addDays(d: ISODate, n: number): ISODate {
  const x = toDate(d);
  x.setUTCDate(x.getUTCDate() + n);
  return fromDate(x);
}

export function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

// Ayın belirli günü; ay o günü içermiyorsa (ör. 31 Şubat) ayın son günü.
export function dateInMonth(year: number, month0: number, day: number): ISODate {
  const y = year + Math.floor(month0 / 12);
  const m = ((month0 % 12) + 12) % 12;
  return fromDate(new Date(Date.UTC(y, m, Math.min(day, daysInMonth(y, m)))));
}

export function addMonths(d: ISODate, n: number): ISODate {
  const x = toDate(d);
  return dateInMonth(x.getUTCFullYear(), x.getUTCMonth() + n, x.getUTCDate());
}

// d tarihinden sonraki (d dahil değil, inclusive=true ise dahil) ilk "ayın day'i"
export function nextMonthlyDate(d: ISODate, day: number, inclusive = false): ISODate {
  const x = toDate(d);
  const candidate = dateInMonth(x.getUTCFullYear(), x.getUTCMonth(), day);
  if (candidate > d || (inclusive && candidate === d)) return candidate;
  return dateInMonth(x.getUTCFullYear(), x.getUTCMonth() + 1, day);
}

// 1=Pazartesi … 7=Pazar
export function isoWeekday(d: ISODate): number {
  const w = toDate(d).getUTCDay();
  return w === 0 ? 7 : w;
}

export function startOfWeek(d: ISODate): ISODate {
  return addDays(d, 1 - isoWeekday(d));
}

export function startOfMonth(d: ISODate): ISODate {
  return `${d.slice(0, 7)}-01`;
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86400000);
}

const TR_MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

export function formatTr(d: ISODate): string {
  return `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
}

export function monthLabel(d: ISODate): string {
  return `${TR_MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
}
