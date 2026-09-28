"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { addDays, addMonths, startOfMonth } from "@/lib/dates";
import { Field, Input, Select, cx } from "./ui";

type Opt = { id: string; name: string };

const PERIODS: Record<string, string> = {
  "": "Tüm zamanlar",
  "bu-ay": "Bu ay",
  "gecen-ay": "Geçen ay",
  "son-3-ay": "Son 3 ay",
  "son-12-ay": "Son 12 ay",
  "bu-yil": "Bu yıl",
  ozel: "Özel aralık",
};

function periodRange(key: string, today: string): [string, string] | null {
  const month = startOfMonth(today);
  switch (key) {
    case "bu-ay":
      return [month, today];
    case "gecen-ay":
      return [addMonths(month, -1), addDays(month, -1)];
    case "son-3-ay":
      return [addMonths(month, -2), today];
    case "son-12-ay":
      return [addMonths(month, -11), today];
    case "bu-yil":
      return [`${today.slice(0, 4)}-01-01`, today];
    default:
      return null;
  }
}

// Filtreler değiştikçe adres satırını günceller; sayfa sunucuda yeniden hesaplanır
export function TxFilterBar({
  accounts,
  categories,
  today,
  sorts,
}: {
  accounts: Opt[];
  categories: (Opt & { kind: string })[];
  today: string;
  sorts: Record<string, string>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");
  const period = params.get("donem") ?? (params.get("baslangic") || params.get("bitis") ? "ozel" : "");

  const apply = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("sayfa");
    start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  // Arama kutusu yazmayı bitirince uygulanır
  useEffect(() => {
    if (q === (params.get("q") ?? "")) return;
    const id = setTimeout(() => apply({ q: q.trim() || null }), 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const setPeriod = (key: string) => {
    const range = periodRange(key, today);
    if (key === "ozel") apply({ donem: "ozel" });
    else apply({ donem: key || null, baslangic: range?.[0] ?? null, bitis: range?.[1] ?? null });
  };

  const active = ["hesap", "kategori", "tur", "min", "max", "q", "transfer", "baslangic", "bitis", "donem"].some((k) => params.get(k));
  const kinds: Record<string, string> = { expense: "Gider", income: "Gelir", transfer: "Transfer" };

  return (
    <div className={cx("grid gap-3", pending && "opacity-70")}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Açıklamada ara">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ör. migros, kira, yakup…" />
        </Field>
        <Field label="Dönem">
          <Select value={period} onChange={(e) => setPeriod(e.target.value)}>
            {Object.entries(PERIODS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
        </Field>
        <Field label="Hesap">
          <Select value={params.get("hesap") ?? ""} onChange={(e) => apply({ hesap: e.target.value || null })}>
            <option value="">Tüm hesaplar</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Kategori">
          <Select value={params.get("kategori") ?? ""} onChange={(e) => apply({ kategori: e.target.value || null })}>
            <option value="">Tüm kategoriler</option>
            <option value="yok">Kategorisiz</option>
            {["expense", "income", "transfer"].map((k) => (
              <optgroup key={k} label={kinds[k]}>
                {categories.filter((c) => c.kind === k).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>
      </div>

      {period === "ozel" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Başlangıç">
            <Input type="date" value={params.get("baslangic") ?? ""} onChange={(e) => apply({ baslangic: e.target.value || null })} />
          </Field>
          <Field label="Bitiş">
            <Input type="date" value={params.get("bitis") ?? ""} onChange={(e) => apply({ bitis: e.target.value || null })} />
          </Field>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex rounded-lg border border-line p-0.5 text-sm">
          {[
            ["", "Tümü"],
            ["giris", "Girişler"],
            ["cikis", "Çıkışlar"],
          ].map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => apply({ tur: k || null })}
              className={cx(
                "rounded-md px-3 py-1.5",
                (params.get("tur") ?? "") === k ? "bg-accent text-white" : "text-muted hover:bg-subtle",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <Field label="Tutar (en az)" className="w-32">
          <Input
            inputMode="decimal"
            defaultValue={params.get("min") ?? ""}
            onBlur={(e) => apply({ min: e.target.value.trim() || null })}
            onKeyDown={(e) => e.key === "Enter" && apply({ min: e.currentTarget.value.trim() || null })}
          />
        </Field>
        <Field label="Tutar (en çok)" className="w-32">
          <Input
            inputMode="decimal"
            defaultValue={params.get("max") ?? ""}
            onBlur={(e) => apply({ max: e.target.value.trim() || null })}
            onKeyDown={(e) => e.key === "Enter" && apply({ max: e.currentTarget.value.trim() || null })}
          />
        </Field>
        <Field label="Sıralama" className="w-56">
          <Select value={params.get("sirala") ?? "yeni"} onChange={(e) => apply({ sirala: e.target.value === "yeni" ? null : e.target.value })}>
            {Object.entries(sorts).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
        </Field>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            checked={params.get("transfer") === "gizle"}
            onChange={(e) => apply({ transfer: e.target.checked ? "gizle" : null })}
          />
          Transferleri gizle
        </label>
        {active && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              start(() => router.replace(pathname, { scroll: false }));
            }}
            className="pb-2 text-sm text-accent hover:underline"
          >
            Filtreleri temizle
          </button>
        )}
      </div>
    </div>
  );
}
