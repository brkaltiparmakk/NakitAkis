import { desc, eq } from "drizzle-orm";
import { archiveAccount, deleteStatement, saveStatement, setBalance } from "@/app/actions/accounts";
import { AccountForm, BANK_NAMES } from "@/components/AccountForm";
import { Button, Card, Empty, Field, Input, Money, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { projectionInput } from "@/lib/data";
import { addMonths, formatTr, todayIso } from "@/lib/dates";
import { cardOutstanding, project } from "@/lib/projection";
import { tl, toNum } from "@/lib/money";

export default async function AccountsPage() {
  const user = await requireUser();
  const today = todayIso();
  const input = await projectionInput(user.id, today, addMonths(today, 3));
  const snap = input.snap;
  const projected = project(input);
  const statements = await db()
    .select()
    .from(schema.cardStatements)
    .where(eq(schema.cardStatements.userId, user.id))
    .orderBy(desc(schema.cardStatements.statementDate));
  const checkingList = snap.checking.map((c) => ({ id: c.account.id, name: c.account.name }));

  return (
    <>
      <PageHeader
        title="Hesaplar & Kartlar"
        description="Vadesiz hesaplarınızı ve kredi kartlarınızı tanımlayın. Bakiye, dökümdeki bakiye sütunundan otomatik alınır; yoksa elle girebilirsiniz."
      />

      <Card title="Yeni hesap / kart" className="mb-6">
        <AccountForm checkingAccounts={checkingList} />
      </Card>

      <h2 className="mb-3 text-lg font-semibold">Vadesiz hesaplar</h2>
      <div className="mb-8 grid gap-4">
        {snap.checking.length === 0 && <Empty>Henüz vadesiz hesap yok.</Empty>}
        {snap.checking.map(({ account: a, balance, autoSpend }) => (
          <Card
            key={a.id}
            title={`${a.name} · ${BANK_NAMES[a.bank] ?? a.bank}`}
            actions={
              <form action={archiveAccount}>
                <input type="hidden" name="id" value={a.id} />
                <Button variant="danger">Arşivle</Button>
              </form>
            }
          >
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <div className="text-2xl font-semibold">
                <Money value={balance} signed />
              </div>
              <div className="text-xs text-muted">
                {a.balanceDate
                  ? `Bakiye çapası: ${formatTr(a.balanceDate)} · ${a.balanceSource === "statement" ? "dökümden" : "elle"}; sonrası işlemlerle hesaplanıyor`
                  : "Bakiye bilinmiyor: yalnızca işlemlerin toplamı gösteriliyor"}
              </div>
              <div className="text-xs text-muted">
                Projeksiyondaki aylık harcama:{" "}
                <Money value={a.expectedMonthlySpend !== null ? toNum(a.expectedMonthlySpend) : autoSpend} />
                {a.expectedMonthlySpend === null && " (son 3 ay ortalaması)"}
              </div>
              {a.kmhLimit && (
                <div className="text-xs text-muted">
                  KMH limiti: <Money value={toNum(a.kmhLimit)} />
                </div>
              )}
            </div>
            <details className="mt-3">
              <summary className="cursor-pointer text-sm text-accent">Bakiyeyi elle gir / hesabı düzenle</summary>
              <form action={setBalance} className="mt-3 flex flex-wrap items-end gap-3">
                <input type="hidden" name="id" value={a.id} />
                <Field label="Gün sonu bakiyesi (₺)">
                  <Input name="balance" inputMode="decimal" required />
                </Field>
                <Field label="Tarih">
                  <Input name="balanceDate" type="date" defaultValue={today} />
                </Field>
                <Button>Kaydet</Button>
              </form>
              <div className="mt-4 border-t border-line pt-4">
                <AccountForm account={a} checkingAccounts={checkingList} autoSpend={autoSpend} />
              </div>
            </details>
          </Card>
        ))}
      </div>

      <h2 className="mb-3 text-lg font-semibold">Kredi kartları</h2>
      <div className="grid gap-4">
        {snap.cards.length === 0 && <Empty>Henüz kredi kartı yok.</Empty>}
        {snap.cards.map(({ account: a, latest, unbilledSpend, installments, autoSpend }) => {
          const own = statements.filter((s) => s.accountId === a.id);
          return (
            <Card
              key={a.id}
              title={`${a.name} · ${BANK_NAMES[a.bank] ?? a.bank}`}
              actions={
                <form action={archiveAccount}>
                  <input type="hidden" name="id" value={a.id} />
                  <Button variant="danger">Arşivle</Button>
                </form>
              }
            >
              {(() => {
                const cardInput = input.cards.find((c) => c.id === a.id);
                const next = projected.events.find((e) => e.kind === "card" && e.cardId === a.id);
                return (
                  <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <div>
                      <dt className="text-muted">Güncel borç</dt>
                      <dd className="text-lg font-semibold">
                        <Money value={cardInput ? cardOutstanding(cardInput, today) : unbilledSpend} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">
                        Sıradaki ödeme {a.paymentMode === "full" ? "(tamamı)" : "(asgari)"}
                      </dt>
                      <dd className="text-lg font-semibold">
                        {next ? <Money value={-next.amount} /> : "—"}
                        {next && <span className="block text-xs font-normal text-muted">son gün {formatTr(next.date)}</span>}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Son yüklenen ekstre</dt>
                      <dd className="font-semibold">
                        {latest ? (
                          <>
                            <Money value={latest.totalDue} />
                            <span className="block text-xs font-normal text-muted">
                              {formatTr(latest.statementDate)} · {latest.minDue <= 0 ? "ödenmiş" : `asgari ${tl(latest.minDue)}`}
                            </span>
                          </>
                        ) : (
                          "—"
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Dönem içi harcama</dt>
                      <dd className="font-semibold">
                        <Money value={unbilledSpend} />
                        <span className="block text-xs font-normal text-muted">henüz ekstreye girmedi</span>
                      </dd>
                    </div>
                  </dl>
                );
              })()}
              <p className="mt-2 text-xs text-muted">
                Kesim günü {a.statementDay ?? "?"}, son ödeme günü {a.dueDay ?? "?"} ·{" "}
                {a.paymentMode === "full" ? "tamamı ödeniyor" : "asgari ödeniyor"} · {installments.length} devam eden
                taksitli alışveriş · aylık yeni harcama{" "}
                <Money value={a.expectedMonthlySpend !== null ? toNum(a.expectedMonthlySpend) : autoSpend} />
                {a.expectedMonthlySpend === null && " (otomatik)"}
              </p>

              <details className="mt-3">
                <summary className="cursor-pointer text-sm text-accent">Ekstreler ve ayarlar</summary>
                <p className="mt-3 text-xs text-muted">
                  PDF ekstreden okunamazsa dönem borcu ve asgari ödemeyi buradan elle girebilirsiniz.
                </p>
                <form action={saveStatement} className="mt-2 grid gap-3 sm:grid-cols-5">
                  <input type="hidden" name="accountId" value={a.id} />
                  <Field label="Kesim tarihi">
                    <Input name="statementDate" type="date" required />
                  </Field>
                  <Field label="Son ödeme tarihi">
                    <Input name="dueDate" type="date" required />
                  </Field>
                  <Field label="Dönem borcu (₺)">
                    <Input name="totalDue" inputMode="decimal" required />
                  </Field>
                  <Field label="Asgari ödeme (₺)">
                    <Input name="minDue" inputMode="decimal" required />
                  </Field>
                  <div className="flex items-end">
                    <Button>Ekstre ekle</Button>
                  </div>
                </form>
                {own.length > 0 && (
                  <div className="mt-3 overflow-x-auto">
                    <table className="data">
                      <thead>
                        <tr>
                          <th>Kesim</th>
                          <th>Son ödeme</th>
                          <th className="text-right">Borç</th>
                          <th className="text-right">Asgari</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {own.map((s) => (
                          <tr key={s.id}>
                            <td>{formatTr(s.statementDate)}</td>
                            <td>{formatTr(s.dueDate)}</td>
                            <td className="text-right">
                              <Money value={toNum(s.totalDue)} />
                            </td>
                            <td className="text-right">
                              <Money value={toNum(s.minDue)} />
                            </td>
                            <td className="text-right">
                              <form action={deleteStatement}>
                                <input type="hidden" name="id" value={s.id} />
                                <Button variant="danger">Sil</Button>
                              </form>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {installments.length > 0 && (
                  <div className="mt-3">
                    <div className="mb-1 text-sm font-medium">Devam eden taksitler</div>
                    <ul className="text-sm text-muted">
                      {installments.map((i, idx) => (
                        <li key={idx}>
                          {i.label}: <Money value={i.amount} /> × {i.remaining} kalan
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="mt-4 border-t border-line pt-4">
                  <AccountForm account={a} checkingAccounts={checkingList} autoSpend={autoSpend} />
                </div>
              </details>
            </Card>
          );
        })}
      </div>
    </>
  );
}
