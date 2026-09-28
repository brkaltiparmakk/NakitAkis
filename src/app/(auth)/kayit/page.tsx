import { redirect } from "next/navigation";
import { register, registrationOpen } from "@/app/actions/auth";
import { AuthForm } from "@/components/AuthForm";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  if (!(await registrationOpen())) redirect("/giris");
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Hesap oluştur</h1>
      <p className="mb-6 text-sm text-muted">Bu ilk ve tek hesap olacak; sonrasında kayıt kapanır.</p>
      <AuthForm action={register} mode="register" />
    </>
  );
}
