import { Card, PageHeader } from "@/components/ui";
import { PasswordForm } from "@/components/PasswordForm";
import { requireUser } from "@/lib/auth";

export default async function SettingsPage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="Ayarlar" description={user.email} />
      <Card title="Şifre değiştir">
        <PasswordForm />
      </Card>
    </>
  );
}
