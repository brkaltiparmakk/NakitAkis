"use client";

import { useMemo, useState, useTransition } from "react";
import { commitImport, previewImport, type CommitResult } from "@/app/actions/import";
import type { ColumnMapping } from "@/db/schema";
import { formatTr } from "@/lib/dates";
import { applyMapping } from "@/lib/import/tabular";
import type { ImportPreview, StatementSummary } from "@/lib/import/types";
import { tl } from "@/lib/money";
import { Button, Card, Field, Input, Select, cx } from "./ui";

type Acc = { id: string; name: string; type: string };

export function ImportWizard({ accounts }: { accounts: Acc[] }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [pending, start] = useTransition();
  const account = accounts.find((a) => a.id === accountId);

  return (
    <div className="grid gap-6">
      <Card title="1. Hesap ve dosya">
        <form
          action={(f) => {
            setError(null);
            setResult(null);
            setPreview(null);
            start(async () => {
              const r = await previewImport(f);
              if (r.error) setError(r.error);
              else setPreview(r.preview!);
            });
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <Field label="Hangi hesaba / karta ait?">
            <Select name="accountId" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} {a.type === "credit_card" ? "(kart)" : "(vadesiz)"}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Dosya" hint="Excel (.xlsx/.xls), CSV veya PDF · en fazla 4 MB">
            <Input name="file" type="file" accept=".xlsx,.xls,.csv,.txt,.pdf" required />
          </Field>
          <Button disabled={pending || !accountId}>{pending && !preview ? "Okunuyor…" : "Önizle"}</Button>
        </form>
        {error && <p className="mt-3 text-sm text-neg">{error}</p>}
      </Card>

      {preview?.kind === "table" && account && (
        <TablePreview
          key={preview.fileName}
          preview={preview}
          isCard={account.type === "credit_card"}
          pending={pending}
          onCommit={(payload) =>
            start(async () => {
              setResult(await commitImport({ accountId, fileName: preview.fileName, ...payload }));
              setPreview(null);
            })
          }
        />
      )}
      {preview?.kind === "pdf" && account && (
        <PdfPreview
          key={preview.fileName}
          preview={preview}
          isCard={account.type === "credit_card"}
          pending={pending}
          onCommit={(payload) =>
            start(async () => {
              setResult(await commitImport({ accountId, fileName: preview.fileName, ...payload }));
              setPreview(null);
            })
          }
        />
      )}

      {result && (
        <Card title="Sonuç">
          {"error" in result ? (
            <p className="text-sm text-neg">{result.error}</p>
          ) : (
            <ul className="text-sm">
              <li><b>{result.inserted}</b> işlem eklendi, <b>{result.categorized}</b> tanesi otomatik kategorilendi.</li>
              <li><b>{result.skipped}</b> işlem daha önce yüklendiği için atlandı.</li>
              {result.balanceUpdated && <li>Hesap bakiyesi dökümden güncellendi.</li>}
              {result.statementSaved && <li>Ekstre özeti (borç, asgari, son ödeme) kaydedildi.</li>}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}

type Payload = {
  transactions: ReturnType<typeof applyMapping>["transactions"];
  balanceAnchor: { date: string; amount: number } | null;
  mapping: ColumnMapping | null;
  statement: { statementDate: string; dueDate: string; totalDue: number; minDue: number } | null;
};

function TxTable({ txs }: { txs: Payload["transactions"] }) {
  const shown = txs.slice(0, 200);
  return (
    <div className="max-h-[420px] overflow-auto rounded-lg border border-line">
      <table className="data">
        <thead className="sticky top-0 bg-surface">
          <tr>
            <th>Tarih</th>
            <th>Açıklama</th>
            <th>Taksit</th>
            <th className="text-right">Tutar</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((t, i) => (
            <tr key={i}>
              <td className="whitespace-nowrap">{formatTr(t.date)}</td>
              <td>{t.description}</td>
              <td>{t.installmentNo ? `${t.installmentNo}/${t.installmentTotal}` : ""}</td>
              <td className={cx("text-right tabular-nums", t.amount < 0 ? "text-neg" : "text-pos")}>{tl(t.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {txs.length > shown.length && <p className="p-2 text-xs text-muted">… ve {txs.length - shown.length} satır daha</p>}
    </div>
  );
}

function Summary({ txs }: { txs: Payload["transactions"] }) {
  const inflow = txs.filter((t) => t.amount > 0).reduce((a, t) => a + t.amount, 0);
  const outflow = txs.filter((t) => t.amount < 0).reduce((a, t) => a - t.amount, 0);
  return (
    <p className="text-sm text-muted">
      {txs.length} işlem · giriş {tl(inflow)} · çıkış {tl(outflow)}
    </p>
  );
}

function TablePreview({
  preview,
  isCard,
  pending,
  onCommit,
}: {
  preview: Extract<ImportPreview, { kind: "table" }>;
  isCard: boolean;
  pending: boolean;
  onCommit: (p: Payload) => void;
}) {
  const initial: ColumnMapping = preview.mapping ?? { headerRow: 0, date: 0, description: 1, amount: 2, invertSign: isCard };
  const [m, setM] = useState<ColumnMapping>(initial);
  const header = preview.rows[m.headerRow] ?? [];
  const width = Math.max(...preview.rows.slice(0, 50).map((r) => r.length), 0);
  const cols = Array.from({ length: width }, (_, i) => ({ i, label: `${i + 1}. sütun${header[i] ? ` – ${String(header[i]).slice(0, 30)}` : ""}` }));
  const result = useMemo(() => applyMapping(preview.rows, m), [preview.rows, m]);
  const twoCols = m.amount === undefined;

  const colSelect = (key: "date" | "description" | "amount" | "debit" | "credit" | "balance", optional = false) => (
    <Select
      value={m[key] ?? ""}
      onChange={(e) => setM({ ...m, [key]: e.target.value === "" ? undefined : Number(e.target.value) })}
    >
      {optional && <option value="">— yok —</option>}
      {cols.map((c) => (
        <option key={c.i} value={c.i}>{c.label}</option>
      ))}
    </Select>
  );

  return (
    <Card title="2. Sütunları kontrol edin">
      {!preview.mapping && (
        <p className="mb-3 text-sm text-warn">Başlık satırı otomatik bulunamadı; sütunları elle seçin.</p>
      )}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Başlık satırı" hint={`Dosyada ${preview.rows.length} satır var`}>
          <Input type="number" min={1} value={m.headerRow + 1} onChange={(e) => setM({ ...m, headerRow: Math.max(0, Number(e.target.value) - 1) })} />
        </Field>
        <Field label="Tarih">{colSelect("date")}</Field>
        <Field label="Açıklama">{colSelect("description")}</Field>
        <Field label="Tutar biçimi">
          <Select
            value={twoCols ? "two" : "one"}
            onChange={(e) =>
              setM(e.target.value === "two"
                ? { ...m, amount: undefined, debit: m.debit ?? 0, credit: m.credit ?? 0 }
                : { ...m, amount: m.amount ?? 0, debit: undefined, credit: undefined })
            }
          >
            <option value="one">Tek sütun (işaretli tutar)</option>
            <option value="two">Ayrı Borç / Alacak sütunları</option>
          </Select>
        </Field>
        {twoCols ? (
          <>
            <Field label="Borç (çıkış)">{colSelect("debit")}</Field>
            <Field label="Alacak (giriş)">{colSelect("credit")}</Field>
          </>
        ) : (
          <Field label="Tutar">{colSelect("amount")}</Field>
        )}
        <Field label="Bakiye (isteğe bağlı)" hint="Varsa hesap bakiyesi buradan alınır">{colSelect("balance", true)}</Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={m.invertSign} onChange={(e) => setM({ ...m, invertSign: e.target.checked })} />
          İşaretleri ters çevir
          <span className="text-xs text-muted">(harcamalar kırmızı/eksi görünmeli)</span>
        </label>
      </div>
      <Summary txs={result.transactions} />
      {result.skippedRows > 0 && <p className="text-xs text-muted">{result.skippedRows} satır tarih/tutar içermediği için atlandı (başlık, toplam vb.).</p>}
      {result.balanceAnchor && (
        <p className="text-sm text-muted">Son bakiye: {formatTr(result.balanceAnchor.date)} itibarıyla {tl(result.balanceAnchor.amount)}</p>
      )}
      <div className="mt-3">
        <TxTable txs={result.transactions} />
      </div>
      <Button
        className="mt-4"
        disabled={pending || result.transactions.length === 0}
        onClick={() => onCommit({ transactions: result.transactions, balanceAnchor: result.balanceAnchor, mapping: m, statement: null })}
      >
        {pending ? "Kaydediliyor…" : `${result.transactions.length} işlemi kaydet`}
      </Button>
    </Card>
  );
}

function PdfPreview({
  preview,
  isCard,
  pending,
  onCommit,
}: {
  preview: Extract<ImportPreview, { kind: "pdf" }>;
  isCard: boolean;
  pending: boolean;
  onCommit: (p: Payload) => void;
}) {
  const [invert, setInvert] = useState(isCard);
  const [summary, setSummary] = useState<StatementSummary>(preview.summary);
  const txs = useMemo(
    () => preview.transactions.map((t) => ({ ...t, amount: invert ? -t.amount : t.amount })),
    [preview.transactions, invert],
  );
  const statementComplete = summary.statementDate && summary.dueDate && summary.totalDue !== null && summary.minDue !== null;
  const num = (v: string) => {
    const n = Number(v.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) && v.trim() !== "" ? n : null;
  };

  return (
    <Card title="2. PDF'ten okunanları kontrol edin">
      {isCard && (
        <div className="mb-4 grid gap-3 sm:grid-cols-4">
          <Field label="Hesap kesim tarihi">
            <Input type="date" value={summary.statementDate ?? ""} onChange={(e) => setSummary({ ...summary, statementDate: e.target.value || null })} />
          </Field>
          <Field label="Son ödeme tarihi">
            <Input type="date" value={summary.dueDate ?? ""} onChange={(e) => setSummary({ ...summary, dueDate: e.target.value || null })} />
          </Field>
          <Field label="Dönem borcu (₺)">
            <Input inputMode="decimal" defaultValue={summary.totalDue?.toString().replace(".", ",") ?? ""} onChange={(e) => setSummary({ ...summary, totalDue: num(e.target.value) })} />
          </Field>
          <Field label="Asgari ödeme (₺)">
            <Input inputMode="decimal" defaultValue={summary.minDue?.toString().replace(".", ",") ?? ""} onChange={(e) => setSummary({ ...summary, minDue: num(e.target.value) })} />
          </Field>
        </div>
      )}
      <label className="mb-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={invert} onChange={(e) => setInvert(e.target.checked)} />
        İşaretleri ters çevir <span className="text-xs text-muted">(harcamalar eksi görünmeli)</span>
      </label>
      <Summary txs={txs} />
      {txs.length === 0 && (
        <p className="text-sm text-warn">
          Bu PDF&apos;te işlem satırı tanınamadı. Aşağıdaki ham metni kontrol edin; bankanıza özel okuyucu eklenmesi gerekebilir.
        </p>
      )}
      <div className="mt-3">
        <TxTable txs={txs} />
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-sm text-muted">PDF&apos;ten çıkan ham metin ({preview.lines.length} satır)</summary>
        <pre className="mt-2 max-h-80 overflow-auto rounded-lg bg-subtle p-3 text-xs">{preview.lines.join("\n")}</pre>
      </details>
      <Button
        className="mt-4"
        disabled={pending || (txs.length === 0 && !statementComplete)}
        onClick={() =>
          onCommit({
            transactions: txs,
            balanceAnchor: null,
            mapping: null,
            statement: isCard && statementComplete
              ? { statementDate: summary.statementDate!, dueDate: summary.dueDate!, totalDue: summary.totalDue!, minDue: summary.minDue! }
              : null,
          })
        }
      >
        {pending ? "Kaydediliyor…" : `${txs.length} işlemi kaydet`}
      </Button>
    </Card>
  );
}
