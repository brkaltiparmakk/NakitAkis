import Link from "next/link";
import { login, registrationOpen } from "@/app/actions/auth";
import { AuthForm } from "@/components/AuthForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const open = await registrationOpen();
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Nakit Akış</h1>
      <p className="mb-6 text-sm text-muted">Devam etmek için giriş yapın.</p>
      <AuthForm action={login} mode="login" />
      {open && (
        <p className="mt-4 text-center text-sm text-muted">
          Henüz hesap yok. <Link href="/kayit" className="text-accent underline">İlk hesabı oluşturun</Link>
        </p>
      )}
    </>
  );
}
