import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { deleteImport } from "@/app/actions/import";
import { ImportWizard } from "@/components/ImportWizard";
import { Button, Card, Empty, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getAccounts } from "@/lib/data";

export default async function ImportPage() {
  const user = await requireUser();
  const accounts = await getAccounts(user.id);
  const history = await db()
    .select({
      id: schema.imports.id,
      fileName: schema.imports.fileName,
      createdAt: schema.imports.createdAt,
      rowCount: schema.imports.rowCount,
      insertedCount: schema.imports.insertedCount,
      skippedCount: schema.imports.skippedCount,
      account: schema.accounts.name,
    })
    .from(schema.imports)
    .innerJoin(schema.accounts, eq(schema.accounts.id, schema.imports.accountId))
    .where(eq(schema.imports.userId, user.id))
    .orderBy(desc(schema.imports.createdAt))
    .limit(30);

  return (
    <>
      <PageHeader
        title="Ekstre Yükle"
        description="Bankadan indirdiğiniz hesap dökümü veya kart ekstresini yükleyin. Daha önce yüklenmiş işlemler otomatik atlanır; çakışan dönemleri gönül rahatlığıyla yükleyebilirsiniz."
      />
      {accounts.length === 0 ? (
        <Empty>
          Önce <Link href="/hesaplar" className="text-accent underline">Hesaplar & Kartlar</Link> sayfasından bir hesap ekleyin.
        </Empty>
      ) : (
        <ImportWizard accounts={accounts.map((a) => ({ id: a.id, name: a.name, type: a.type }))} />
      )}

      <Card title="Yükleme geçmişi" className="mt-8">
        {history.length === 0 ? (
          <p className="text-sm text-muted">Henüz yükleme yok.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th>Hesap</th>
                  <th>Dosya</th>
                  <th className="text-right">Eklenen</th>
                  <th className="text-right">Atlanan</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td className="whitespace-nowrap">{h.createdAt.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })}</td>
                    <td>{h.account}</td>
                    <td className="max-w-xs truncate">{h.fileName}</td>
                    <td className="text-right">{h.insertedCount}</td>
                    <td className="text-right">{h.skippedCount}</td>
                    <td className="text-right">
                      <form action={deleteImport}>
                        <input type="hidden" name="id" value={h.id} />
                        <Button variant="danger" title="Bu yüklemeyle eklenen işlemleri siler">Geri al</Button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
