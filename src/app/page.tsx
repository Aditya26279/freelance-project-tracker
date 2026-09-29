import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

const FEATURES = [
  ["Proposals clients can sign", "Send a scoped proposal to the portal. Once accepted, its line items become milestones."],
  ["Milestone approvals", "Submit deliverables for review. Clients approve or request changes, and every step is logged."],
  ["Built-in time tracking", "One-click timer or manual entries. Unbilled hours flow straight into invoices."],
  ["Invoices paid online", "Clients pay by card through Stripe or by UPI/cards/netbanking through Razorpay."],
  ["A portal for every client", "A private link. No account or password for the client, and you can revoke it any time."],
  ["Your keys, your money", "Payments go straight to your own Stripe or Razorpay account. Keys are encrypted at rest."],
];

export default async function Landing() {
  if (await getSession()) redirect("/dashboard");
  return (
    <div className="min-h-screen bg-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <span className="text-lg font-semibold tracking-tight">
          <span className="text-brand-600">●</span> Clientdesk
        </span>
        <nav className="flex gap-2">
          <Link href="/login" className="btn-ghost">
            Log in
          </Link>
          <Link href="/signup" className="btn-primary">
            Get started
          </Link>
        </nav>
      </header>
      <main>
        <section className="mx-auto max-w-4xl px-6 pb-16 pt-20 text-center">
          <h1 className="text-5xl font-semibold tracking-tight text-slate-900">
            Run client work from proposal to paid.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
            Proposals, milestones, time tracking, client approvals and invoicing in one place, plus a
            clean portal your clients will actually use.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link href="/signup" className="btn-primary px-5 py-2.5 text-base">
              Start free
            </Link>
            <Link href="/login" className="btn-secondary px-5 py-2.5 text-base">
              I have an account
            </Link>
          </div>
        </section>
        <section className="mx-auto grid max-w-6xl gap-4 px-6 pb-24 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(([t, b]) => (
            <div key={t} className="card p-6">
              <h3 className="font-semibold">{t}</h3>
              <p className="mt-2 text-sm text-slate-600">{b}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
