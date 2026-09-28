"use client";

import { useState } from "react";
import { saveAccount } from "@/app/actions/accounts";
import type { Account } from "@/db/schema";
import { Button, Field, Input, Select } from "./ui";

export const BANK_NAMES: Record<string, string> = {
  garanti: "Garanti BBVA",
  isbank: "İş Bankası",
  yapikredi: "Yapı Kredi",
  akbank: "Akbank",
  diger: "Diğer",
};

const pct = (v: string | null | undefined) => (v ? String(+(Number(v) * 100).toFixed(3)).replace(".", ",") : "");
const amt = (v: string | null | undefined) => (v ? String(Number(v)).replace(".", ",") : "");

export function AccountForm({
  account,
  checkingAccounts,
  autoSpend,
  onDone,
}: {
  account?: Account;
  checkingAccounts: { id: string; name: string }[];
  // Geçmiş hareketlerden hesaplanan aylık harcama (boş bırakılırsa kullanılır)
  autoSpend?: number;
  onDone?: () => void;
}) {
  const [type, setType] = useState(account?.type ?? "checking");
  const autoPlaceholder = autoSpend !== undefined ? `Otomatik: ${Math.round(autoSpend).toLocaleString("tr-TR")}` : "Otomatik";
  const spendHint = "Boş bırakırsanız son 3 ayın ortalaması kullanılır (kredi taksidi ve faiz hariç)";
  return (
    <form
      action={async (f) => {
        await saveAccount(f);
        onDone?.();
      }}
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
    >
      {account && <input type="hidden" name="id" value={account.id} />}
      <Field label="Tür">
        <Select name="type" value={type} onChange={(e) => setType(e.target.value)} disabled={!!account}>
          <option value="checking">Vadesiz hesap</option>
          <option value="credit_card">Kredi kartı</option>
        </Select>
        {account && <input type="hidden" name="type" value={type} />}
      </Field>
      <Field label="Banka">
        <Select name="bank" defaultValue={account?.bank ?? "garanti"}>
          {Object.entries(BANK_NAMES).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </Select>
      </Field>
      <Field label="Ad">
        <Input name="name" required defaultValue={account?.name} placeholder={type === "checking" ? "Garanti Vadesiz" : "Bonus Kart"} />
      </Field>

      {type === "checking" ? (
        <>
          <Field label="KMH limiti (₺)" hint="Kredili mevduat hesabı yoksa boş bırakın">
            <Input name="kmhLimit" inputMode="decimal" defaultValue={amt(account?.kmhLimit)} />
          </Field>
          <Field label="KMH aylık faiz (%)" hint="Vergiler hariç, ör. 4,25">
            <Input name="kmhMonthlyRate" inputMode="decimal" defaultValue={pct(account?.kmhMonthlyRate)} />
          </Field>
          <Field label="Aylık günlük harcama (₺)" hint={spendHint}>
            <Input name="expectedMonthlySpend" inputMode="decimal" defaultValue={amt(account?.expectedMonthlySpend)} placeholder={autoPlaceholder} />
          </Field>
        </>
      ) : (
        <>
          <Field label="Kart limiti (₺)">
            <Input name="cardLimit" inputMode="decimal" defaultValue={amt(account?.cardLimit)} />
          </Field>
          <Field label="Hesap kesim günü">
            <Input name="statementDay" type="number" min={1} max={31} required defaultValue={account?.statementDay ?? ""} />
          </Field>
          <Field label="Son ödeme günü">
            <Input name="dueDay" type="number" min={1} max={31} required defaultValue={account?.dueDay ?? ""} />
          </Field>
          <Field label="Asgari ödeme oranı (%)" hint="Limit 50.000 ₺ altı %20, üstü %40">
            <Input name="minPaymentRate" inputMode="decimal" defaultValue={pct(account?.minPaymentRate) || "20"} />
          </Field>
          <Field label="Akdi faiz, aylık (%)" hint="Vergiler hariç; KKDF+BSMV otomatik eklenir">
            <Input name="cardMonthlyRate" inputMode="decimal" defaultValue={pct(account?.cardMonthlyRate) || "4,25"} />
          </Field>
          <Field label="Ödeme alışkanlığı">
            <Select name="paymentMode" defaultValue={account?.paymentMode ?? "minimum"}>
              <option value="minimum">Asgari ödeme</option>
              <option value="full">Tamamı</option>
            </Select>
          </Field>
          <Field label="Tahmini aylık yeni harcama (₺)" hint={spendHint}>
            <Input name="expectedMonthlySpend" inputMode="decimal" defaultValue={amt(account?.expectedMonthlySpend)} placeholder={autoPlaceholder} />
          </Field>
          <Field label="Ödendiği hesap">
            <Select name="payFromAccountId" defaultValue={account?.payFromAccountId ?? ""}>
              <option value="">İlk vadesiz hesap</option>
              {checkingAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </Field>
        </>
      )}
      <div className="flex items-end">
        <Button>{account ? "Kaydet" : "Ekle"}</Button>
      </div>
    </form>
  );
}
