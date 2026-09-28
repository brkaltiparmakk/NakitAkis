"use client";

import { useEffect, useState } from "react";
import { bulkSetCategory } from "@/app/actions/categories";
import { Button, cx, inputCls } from "./ui";

const selector = 'input[type="checkbox"][name="ids"][form="bulk"]';

// Tablodaki tüm satır kutucuklarını seçer/bırakır
export function SelectAll() {
  const [checked, setChecked] = useState(false);
  return (
    <input
      type="checkbox"
      aria-label="Tümünü seç"
      checked={checked}
      onChange={(e) => {
        setChecked(e.target.checked);
        document.querySelectorAll<HTMLInputElement>(selector).forEach((el) => {
          el.checked = e.target.checked;
        });
        document.dispatchEvent(new Event("bulk-change"));
      }}
    />
  );
}

// Satır kutucuğu: tablo dışındaki "bulk" formuna bağlıdır
export function RowCheck({ id }: { id: string }) {
  return (
    <input
      type="checkbox"
      name="ids"
      value={id}
      form="bulk"
      aria-label="Seç"
      onChange={() => document.dispatchEvent(new Event("bulk-change"))}
    />
  );
}

// Toplu kategori atama çubuğu: seçili satırlar "bulk" formuna bağlı kutucuklardan gelir
export function BulkBar({ categories }: { categories: { id: string; name: string; kind: string }[] }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const update = () => setCount(document.querySelectorAll(`${selector}:checked`).length);
    document.addEventListener("bulk-change", update);
    return () => document.removeEventListener("bulk-change", update);
  }, []);
  const kinds: Record<string, string> = { expense: "Gider", income: "Gelir", transfer: "Transfer" };
  return (
    <form
      id="bulk"
      action={async (f) => {
        await bulkSetCategory(f);
        document.querySelectorAll<HTMLInputElement>(selector).forEach((el) => (el.checked = false));
        setCount(0);
      }}
      className={cx(
        "flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm transition",
        count ? "border-accent bg-accent/5" : "border-line text-muted",
      )}
    >
      <span className="font-medium">{count ? `${count} işlem seçili` : "Toplu işlem için satır seçin"}</span>
      <select name="categoryId" disabled={!count} className={cx(inputCls, "py-1")} defaultValue="">
        <option value="">Kategorisiz yap</option>
        {["expense", "income", "transfer"].map((k) => (
          <optgroup key={k} label={kinds[k]}>
            {categories.filter((c) => c.kind === k).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </optgroup>
        ))}
      </select>
      <Button disabled={!count} className="py-1">Kategoriyi uygula</Button>
    </form>
  );
}
