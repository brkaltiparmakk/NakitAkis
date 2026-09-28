import { asc, eq } from "drizzle-orm";
import { addCategory, addRule, deleteRule } from "@/app/actions/categories";
import { Badge, Button, Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getCategories } from "@/lib/data";

const KIND: Record<string, string> = { income: "Gelir", expense: "Gider", transfer: "Transfer (analize girmez)" };

export default async function CategoriesPage() {
  const user = await requireUser();
  const [categories, rules] = await Promise.all([
    getCategories(user.id),
    db().select().from(schema.categoryRules).where(eq(schema.categoryRules.userId, user.id)).orderBy(asc(schema.categoryRules.pattern)),
  ]);

  return (
    <>
      <PageHeader
        title="Kategoriler & Kurallar"
        description="Açıklamasında anahtar kelime geçen işlemler ilgili kategoriye atanır; birden fazla kural eşleşirse en uzun kelime kazanır. Transfer kategorileri (kart ödemesi, virman) gelir/gider analizine katılmaz."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Yeni kural">
          <form action={addRule} className="grid gap-3 sm:grid-cols-3">
            <Field label="Anahtar kelime"><Input name="pattern" required placeholder="ör. migros" /></Field>
            <Field label="Kategori">
              <Select name="categoryId" required>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <div className="flex items-end"><Button>Ekle</Button></div>
          </form>
        </Card>
        <Card title="Yeni kategori">
          <form action={addCategory} className="grid gap-3 sm:grid-cols-4">
            <Field label="Ad" className="sm:col-span-2"><Input name="name" required /></Field>
            <Field label="Tür">
              <Select name="kind" defaultValue="expense">
                {Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="Renk"><Input name="color" type="color" defaultValue="#64748b" className="h-10 p-1" /></Field>
            <div className="flex items-end"><Button>Ekle</Button></div>
          </form>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {categories.map((c) => {
          const own = rules.filter((r) => r.categoryId === c.id);
          return (
            <Card key={c.id} title={<Badge color={c.color}>{c.name}</Badge>} actions={<span className="text-xs text-muted">{KIND[c.kind]}</span>}>
              {own.length === 0 ? (
                <p className="text-xs text-muted">Kural yok</p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {own.map((r) => (
                    <form key={r.id} action={deleteRule} className="inline-flex items-center gap-1 rounded-full bg-subtle py-0.5 pr-1 pl-2 text-xs">
                      <input type="hidden" name="id" value={r.id} />
                      {r.pattern}
                      <button className="rounded-full px-1 text-muted hover:text-neg" title="Kuralı sil">×</button>
                    </form>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
