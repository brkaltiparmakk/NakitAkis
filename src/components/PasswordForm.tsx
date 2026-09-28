"use client";

import { useActionState } from "react";
import { changePassword } from "@/app/actions/auth";
import { Button, Field, Input } from "./ui";

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePassword, undefined);
  return (
    <form action={action} className="grid max-w-sm gap-3">
      <Field label="Mevcut şifre">
        <Input name="current" type="password" autoComplete="current-password" required />
      </Field>
      <Field label="Yeni şifre" hint="En az 10 karakter">
        <Input name="password" type="password" autoComplete="new-password" required />
      </Field>
      <Field label="Yeni şifre (tekrar)">
        <Input name="password2" type="password" autoComplete="new-password" required />
      </Field>
      {state?.error && <p className="text-sm text-neg">{state.error}</p>}
      {state?.ok && <p className="text-sm text-pos">Şifreniz değiştirildi.</p>}
      <Button disabled={pending}>Şifreyi değiştir</Button>
    </form>
  );
}
