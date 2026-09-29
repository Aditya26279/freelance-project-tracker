"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CURRENCIES } from "@/lib/constants";
import { login, signup } from "./actions";

function Shell({ title, children, footer }: { title: string; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 block text-center text-lg font-semibold tracking-tight">
          <span className="text-brand-600">●</span> Clientdesk
        </Link>
        <div className="card p-6">
          <h1 className="mb-5 text-lg font-semibold">{title}</h1>
          {children}
        </div>
        <p className="mt-4 text-center text-sm text-slate-500">{footer}</p>
      </div>
    </div>
  );
}

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <Shell
      title="Log in"
      footer={
        <>
          No account?{" "}
          <Link href="/signup" className="link">
            Sign up
          </Link>
        </>
      }
    >
      <form action={action} className="space-y-4">
        <label className="block">
          <span className="label">Email</span>
          <input name="email" type="email" required autoComplete="email" className="input" />
        </label>
        <label className="block">
          <span className="label">Password</span>
          <input name="password" type="password" required autoComplete="current-password" className="input" />
        </label>
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button className="btn-primary w-full" disabled={pending}>
          {pending ? "Logging in…" : "Log in"}
        </button>
      </form>
    </Shell>
  );
}

export function SignupForm() {
  const [state, action, pending] = useActionState(signup, undefined);
  return (
    <Shell
      title="Create your workspace"
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="link">
            Log in
          </Link>
        </>
      }
    >
      <form action={action} className="space-y-4">
        <label className="block">
          <span className="label">Your name</span>
          <input name="name" required className="input" autoComplete="name" />
        </label>
        <label className="block">
          <span className="label">Business / studio name</span>
          <input name="business" required className="input" placeholder="Jane Doe Design" />
        </label>
        <label className="block">
          <span className="label">Email</span>
          <input name="email" type="email" required className="input" autoComplete="email" />
        </label>
        <label className="block">
          <span className="label">Password</span>
          <input name="password" type="password" minLength={8} required className="input" autoComplete="new-password" />
        </label>
        <label className="block">
          <span className="label">Default currency</span>
          <select name="currency" className="input" defaultValue="USD">
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button className="btn-primary w-full" disabled={pending}>
          {pending ? "Creating…" : "Create account"}
        </button>
      </form>
    </Shell>
  );
}
