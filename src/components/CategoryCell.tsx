"use client";

import { useState } from "react";
import { setTransactionCategory } from "@/app/actions/categories";
import { suggestPattern } from "@/lib/categorize";
import { Button, cx, inputCls } from "./ui";

type Cat = { id: string; name: string; kind: string };

const KIND_LABEL: Record<string, string> = { income: "Gelir", expense: "Gider", transfer: "Transfer" };

export function CategoryCell({ txId, description, categoryId, categories }: { txId: string; description: string; categoryId: string | null; categories: Cat[] }) {
  const [value, setValue] = useState(categoryId ?? "");
  const [pattern, setPattern] = useState(() => suggestPattern(description));
  const changed = value !== (categoryId ?? "");
  const groups = ["expense", "income", "transfer"].map((k) => ({ k, items: categories.filter((c) => c.kind === k) }));

  return (
    <form action={setTransactionCategory} className="flex min-w-48 flex-col gap-1">
      <input type="hidden" name="id" value={txId} />
      <select
        name="categoryId"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className={cx(inputCls, "py-1", !value && "text-warn")}
      >
        <option value="">Kategorisiz</option>
        {groups.map((g) => (
          <optgroup key={g.k} label={KIND_LABEL[g.k]}>
            {g.items.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </optgroup>
        ))}
      </select>
      {changed && (
        <div className="flex flex-col gap-1 rounded-lg bg-subtle p-2 text-xs">
          <label className="flex items-center gap-1">
            <input type="checkbox" name="learn" defaultChecked={!!value} /> Kural olarak hatırla:
          </label>
          <input name="pattern" value={pattern} onChange={(e) => setPattern(e.target.value)} className={cx(inputCls, "py-1 text-xs")} />
          <span className="text-muted">Bu kelimeyi içeren kategorisiz işlemlere de uygulanır.</span>
          <Button className="py-1">Kaydet</Button>
        </div>
      )}
    </form>
  );
}
