"use client";

import { useActionState } from "react";
import type { AuthState } from "@/app/actions/auth";
import { Button, Field, Input } from "./ui";

export function AuthForm({
  action,
  mode,
}: {
  action: (s: AuthState, f: FormData) => Promise<AuthState>;
  mode: "login" | "register";
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field label="E-posta">
        <Input name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Şifre" hint={mode === "register" ? "En az 10 karakter" : undefined}>
        <Input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required />
      </Field>
      {mode === "register" && (
        <Field label="Şifre (tekrar)">
          <Input name="password2" type="password" autoComplete="new-password" required />
        </Field>
      )}
      {state?.error && <p className="text-sm text-neg">{state.error}</p>}
      <Button disabled={pending}>{mode === "login" ? "Giriş yap" : "Hesap oluştur"}</Button>
    </form>
  );
}
