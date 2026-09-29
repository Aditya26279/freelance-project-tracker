"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSession, destroySession, hashPassword, verifyPassword } from "@/lib/auth";
import { CURRENCIES } from "@/lib/constants";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export type AuthState = { error?: string } | undefined;

const signupSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password must be at most 72 characters"),
  business: z.string().trim().min(1, "Business name is required"),
  currency: z.enum(CURRENCIES),
});

export async function signup(_: AuthState, formData: FormData): Promise<AuthState> {
  if (process.env.ALLOW_SIGNUP === "false") return { error: "Sign-ups are disabled." };
  if (!rateLimit(`signup:${await clientIp()}`, 5, 60 * 60_000).ok) {
    return { error: "Too many sign-up attempts. Please try again later." };
  }
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { name, email, password, business, currency } = parsed.data;

  if (await db.user.findUnique({ where: { email } })) {
    return { error: "An account with that email already exists." };
  }
  const user = await db.user.create({
    data: {
      name,
      email,
      passwordHash: await hashPassword(password),
      memberships: {
        create: {
          role: "owner",
          workspace: { create: { name: business, currency, businessEmail: email } },
        },
      },
    },
  });
  await createSession(user.id);
  redirect("/dashboard");
}

export async function login(_: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "").slice(0, 200);
  const ip = await clientIp();
  const byIp = rateLimit(`login-ip:${ip}`, 30, 15 * 60_000);
  const byEmail = rateLimit(`login-email:${email}`, 10, 15 * 60_000);
  if (!byIp.ok || !byEmail.ok) {
    const mins = Math.ceil(Math.max(byIp.retryAfterSec, byEmail.retryAfterSec) / 60);
    return { error: `Too many login attempts. Try again in ${mins} minute(s).` };
  }
  const user = await db.user.findUnique({ where: { email } });
  const valid = await verifyPassword(password, user?.passwordHash ?? null);
  if (!user || !valid) {
    return { error: "Invalid email or password." };
  }
  await createSession(user.id);
  redirect("/dashboard");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
