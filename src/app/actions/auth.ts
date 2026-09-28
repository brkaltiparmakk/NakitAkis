"use server";

import bcrypt from "bcryptjs";
import { count, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { endSession, startSession } from "@/lib/auth";
import { DEFAULT_CATEGORIES } from "@/lib/categorize";

export type AuthState = { error?: string } | undefined;

const credentials = z.object({
  email: z.string().trim().toLowerCase().email("Geçerli bir e-posta girin"),
  password: z.string().min(10, "Şifre en az 10 karakter olmalı").max(200),
});

export async function registrationOpen(): Promise<boolean> {
  const [{ n }] = await db().select({ n: count() }).from(schema.users);
  return n === 0;
}

export async function register(_: AuthState, form: FormData): Promise<AuthState> {
  // Tek kullanıcılı uygulama: ilk hesap açıldıktan sonra kayıt kapanır
  if (!(await registrationOpen())) return { error: "Kayıt kapalı." };
  const parsed = credentials.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (form.get("password") !== form.get("password2")) return { error: "Şifreler eşleşmiyor" };

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const [user] = await db()
    .insert(schema.users)
    .values({ email: parsed.data.email, passwordHash })
    .returning({ id: schema.users.id });

  const cats = await db()
    .insert(schema.categories)
    .values(DEFAULT_CATEGORIES.map((c) => ({ userId: user.id, name: c.name, kind: c.kind, color: c.color })))
    .returning({ id: schema.categories.id, name: schema.categories.name });
  const idByName = new Map(cats.map((c) => [c.name, c.id]));
  const rules = DEFAULT_CATEGORIES.flatMap((c) =>
    c.patterns.map((pattern) => ({ userId: user.id, pattern, categoryId: idByName.get(c.name)!, source: "seed" })),
  );
  if (rules.length) await db().insert(schema.categoryRules).values(rules).onConflictDoNothing();

  await startSession(user.id);
  redirect("/hesaplar");
}

export async function login(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "E-posta veya şifre hatalı" };
  const [user] = await db().select().from(schema.users).where(eq(schema.users.email, parsed.data.email));
  // Kullanıcı yoksa da hash karşılaştırması yapılır ki yanıt süresi e-postanın varlığını ele vermesin
  const ok = await bcrypt.compare(
    parsed.data.password,
    user?.passwordHash ?? "$2b$12$TrXRlR1LOOeKcLvmxyYoKuG0/W40Nj/4oMblYrIqC0.KeKKE3NSWi",
  );
  if (!user || !ok) return { error: "E-posta veya şifre hatalı" };
  await startSession(user.id);
  redirect("/");
}

export async function logout() {
  await endSession();
  redirect("/giris");
}
