import { asc, eq } from "drizzle-orm";
import { deleteLoan, deleteRecurring, saveLoan, saveRecurring } from "@/app/actions/planning";
import { Button, Card, Empty, Field, Input, Money, PageHeader, Select } from "@/components/ui";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getAccounts, getCategories } from "@/lib/data";
import { addMonths, formatTr, todayIso } from "@/lib/dates";
import { toNum } from "@/lib/money";

const FREQ: Record<string, string> = { monthly: "Aylık", weekly: "Haftalık", yearly: "Yıllık" };
const DAYS = ["", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
const LOAN_KIND: Record<string, string> = { konut: "Konut", ihtiyac: "İhtiyaç", tasit: "Taşıt", diger: "Diğer" };

export default async function PlanningPage() {
  const user = await requireUser();
  const [accounts, categories, recurring, loans] = await Promise.all([
    getAccounts(user.id),
    getCategories(user.id),
    db().select().from(schema.recurringItems).where(eq(schema.recurringItems.userId, user.id)).orderBy(asc(schema.recurringItems.direction), asc(schema.recurringItems.name)),
    db().select().from(schema.loans).where(eq(schema.loans.userId, user.id)).orderBy(asc(schema.loans.nextPaymentDate)),
  ]);
  const checking = accounts.filter((a) => a.type === "checking");
  const today = todayIso();
  const accName = new Map(accounts.map((a) => [a.id, a.name]));
  const catName = new Map(categories.map((c) => [c.id, c.name]));

  const accountSelect = (defaultValue?: string | null) => (
    <Select name="accountId" defaultValue={defaultValue ?? ""}>
      <option value="">İlk vadesiz hesap</option>
      {checking.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
    </Select>
  );

  return (
    <>
      <PageHeader
        title="Düzenli Kalemler & Krediler"
        description="Maaş, kira, aidat, faturalar gibi tekrarlayan kalemler ve kredi taksitleri projeksiyona eklenir."
      />

      <Card title="Yeni düzenli kalem" className="mb-4">
        <form action={saveRecurring} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Ad"><Input name="name" required placeholder="Maaş, Kira, Aidat…" /></Field>
          <Field label="Yön">
            <Select name="direction" defaultValue="out">
              <option value="in">Giriş (gelir)</option>
              <option value="out">Çıkış (gider)</option>
            </Select>
          </Field>
          <Field label="Tutar (₺)"><Input name="amount" inputMode="decimal" required /></Field>
          <Field label="Sıklık">
            <Select name="frequency" defaultValue="monthly">
              {Object.entries(FREQ).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="Ayın günü" hint="Aylık/yıllık için"><Input name="dayOfMonth" type="number" min={1} max={31} /></Field>
          <Field label="Haftanın günü" hint="Haftalık için">
            <Select name="dayOfWeek" defaultValue="">
              <option value="">—</option>
              {DAYS.slice(1).map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
            </Select>
          </Field>
          <Field label="Ay" hint="Yıllık için"><Input name="monthOfYear" type="number" min={1} max={12} /></Field>
          <Field label="Kategori">
            <Select name="categoryId" defaultValue="">
              <option value="">—</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Başlangıç"><Input name="startDate" type="date" defaultValue={today} /></Field>
          <Field label="Bitiş (isteğe bağlı)"><Input name="endDate" type="date" /></Field>
          <Field label="Hesap">{accountSelect()}</Field>
          <div className="flex items-end"><Button>Ekle</Button></div>
        </form>
      </Card>

      <Card title="Düzenli kalemler" className="mb-8">
        {recurring.length === 0 ? (
          <Empty>Henüz düzenli kalem yok.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="data">
              <thead><tr><th>Ad</th><th>Sıklık</th><th>Kategori</th><th>Hesap</th><th>Dönem</th><th className="text-right">Tutar</th><th /></tr></thead>
              <tbody>
                {recurring.map((r) => (
                  <tr key={r.id}>
                    <td className="font-medium">{r.name}</td>
                    <td>
                      {FREQ[r.frequency]}
                      {r.frequency === "weekly" ? ` · ${DAYS[r.dayOfWeek ?? 0] ?? ""}` : r.dayOfMonth ? ` · her ${r.dayOfMonth}.` : ""}
                      {r.frequency === "yearly" && r.monthOfYear ? ` / ${r.monthOfYear}. ay` : ""}
                    </td>
                    <td>{r.categoryId ? catName.get(r.categoryId) : "—"}</td>
                    <td>{r.accountId ? accName.get(r.accountId) : "Varsayılan"}</td>
                    <td className="whitespace-nowrap text-muted">{formatTr(r.startDate)}{r.endDate ? ` – ${formatTr(r.endDate)}` : " →"}</td>
                    <td className="text-right"><Money value={r.direction === "in" ? toNum(r.amount) : -toNum(r.amount)} signed /></td>
                    <td className="text-right">
                      <form action={deleteRecurring}><input type="hidden" name="id" value={r.id} /><Button variant="danger">Sil</Button></form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Yeni kredi" className="mb-4">
        <form action={saveLoan} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Ad"><Input name="name" required placeholder="Ev kredisi" /></Field>
          <Field label="Tür">
            <Select name="kind" defaultValue="konut">
              {Object.entries(LOAN_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="Aylık taksit (₺)"><Input name="installmentAmount" inputMode="decimal" required /></Field>
          <Field label="Sıradaki taksit tarihi"><Input name="nextPaymentDate" type="date" required /></Field>
          <Field label="Kalan taksit sayısı" hint="Sıradaki dahil"><Input name="remainingInstallments" type="number" min={0} required /></Field>
          <Field label="Ödendiği hesap">{accountSelect()}</Field>
          <Field label="Not"><Input name="note" /></Field>
          <div className="flex items-end"><Button>Ekle</Button></div>
        </form>
      </Card>

      <Card title="Krediler">
        {loans.length === 0 ? (
          <Empty>Henüz kredi yok.</Empty>
        ) : (
          <div className="grid gap-4">
            {loans.map((l) => {
              const remainingTotal = toNum(l.installmentAmount) * l.remainingInstallments;
              const endDate = l.remainingInstallments > 0 ? addMonths(l.nextPaymentDate, l.remainingInstallments - 1) : null;
              return (
                <details key={l.id} className="rounded-lg border border-line p-3">
                  <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{l.name} <span className="text-xs text-muted">({LOAN_KIND[l.kind] ?? l.kind})</span></span>
                    <span className="text-sm">
                      <Money value={toNum(l.installmentAmount)} /> × {l.remainingInstallments} taksit · kalan toplam <Money value={remainingTotal} />
                      {endDate && <span className="text-muted"> · son taksit {formatTr(endDate)}</span>}
                    </span>
                  </summary>
                  <form action={saveLoan} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <input type="hidden" name="id" value={l.id} />
                    <Field label="Ad"><Input name="name" defaultValue={l.name} required /></Field>
                    <Field label="Tür">
                      <Select name="kind" defaultValue={l.kind}>
                        {Object.entries(LOAN_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </Select>
                    </Field>
                    <Field label="Aylık taksit (₺)"><Input name="installmentAmount" inputMode="decimal" defaultValue={String(toNum(l.installmentAmount)).replace(".", ",")} required /></Field>
                    <Field label="Sıradaki taksit tarihi"><Input name="nextPaymentDate" type="date" defaultValue={l.nextPaymentDate} required /></Field>
                    <Field label="Kalan taksit sayısı"><Input name="remainingInstallments" type="number" min={0} defaultValue={l.remainingInstallments} required /></Field>
                    <Field label="Ödendiği hesap">{accountSelect(l.accountId)}</Field>
                    <Field label="Not"><Input name="note" defaultValue={l.note ?? ""} /></Field>
                    <div className="flex items-end gap-2"><Button>Kaydet</Button></div>
                  </form>
                  <form action={deleteLoan} className="mt-2">
                    <input type="hidden" name="id" value={l.id} />
                    <Button variant="danger">Krediyi sil</Button>
                  </form>
                </details>
              );
            })}
          </div>
        )}
        <p className="mt-3 text-xs text-muted">
          Sıradaki taksit tarihi geçtiyse projeksiyon o taksiti ödenmiş sayar; ara ara bu tarihi ve kalan sayıyı güncelleyin.
        </p>
      </Card>
    </>
  );
}
