# Clientdesk

A freelance project tracker with a client portal: **proposals → milestones → time tracking → client approvals → invoices paid through Stripe or Razorpay**.

Built for running your own freelance business, and structured as a multi-tenant SaaS from day one: every freelancer gets a workspace with their own payment keys.

---

## Features

| Area | What it does |
| --- | --- |
| **Clients** | Contact details, private notes, and a revocable magic-link **client portal** (no client passwords). |
| **Projects** | Fixed-price (milestone) or hourly billing, budget, dates, status, and an activity timeline. |
| **Proposals** | Line-item scope and pricing with "due N days after acceptance". The client signs in the portal by typing their name and ticking agree, and **accepted items become milestones automatically**. |
| **Milestones & approvals** | Start → submit (with deliverable link/notes) → client **approves** or **requests changes** with feedback. Every step is logged with who and when. |
| **Time tracking** | One running timer (persistent top bar), manual entries (`1.5` or `1:30`), billable toggle, weekly and unbilled totals. |
| **Invoicing** | Build from approved milestones + unbilled time + custom lines. Tax %, due dates, sequential numbering, print/PDF, void (releases items for re-billing), mark paid manually. |
| **Payments** | **Stripe Checkout** (cards, wallets) or **Razorpay Checkout** (UPI, cards, netbanking). Confirmed on return, with **signed webhooks** as a safety net. Amount-verified and idempotent. |
| **Dashboard** | Outstanding, paid this month, unbilled hours, awaiting client, and a "needs attention" list (overdue, change requests, ready to invoice). |

## Stack

Next.js 15 (App Router, Server Actions) · React 19 · TypeScript 5 · Prisma 6 (SQLite locally, Postgres in production) · Tailwind CSS v4 · Stripe SDK · Razorpay REST API · Vitest.

---

## Getting started

**Prerequisites:** Node.js 20+ (tested on 24) and npm 10+.

```bash
npm install
cp .env.example .env        # then set APP_SECRET (see below)
npx prisma db push          # create the SQLite database
npm run db:seed             # optional: demo data
npm run dev
```

Open <http://localhost:3000>.

With the seed data, log in as `demo@clientdesk.test` / `demo12345`. The seed command prints two client-portal URLs you can open to see the client side.

Generate an `APP_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | yes | `file:./dev.db` for SQLite, or a Postgres URL in production. |
| `APP_SECRET` | yes | 16+ chars. Encrypts stored payment keys (AES-256-GCM). **Keep it stable**, because changing it makes saved keys unreadable and they must be re-entered. |
| `APP_URL` | yes | Public base URL, used for portal links and payment redirects. |
| `ALLOW_SIGNUP` | no | `false` disables public sign-ups (single-freelancer mode). Default `true`. |

---

## Payments setup

Payment keys are per workspace (**Settings → Online payments**) and are stored encrypted. Money goes straight to the freelancer's own account. Always start with **test keys**.

### Stripe
1. Paste your secret key (`sk_test_…`) and choose **Stripe** as the provider.
2. Recommended: Stripe Dashboard → Developers → Webhooks → add the endpoint shown in Settings (`/api/webhooks/stripe/<workspaceId>`) with events `checkout.session.completed` and `checkout.session.async_payment_succeeded`, then paste the `whsec_…` signing secret.
3. Local webhook testing:
   ```bash
   stripe listen --forward-to localhost:3000/api/webhooks/stripe/<workspaceId>
   ```
4. Test card: `4242 4242 4242 4242`, any future expiry, any CVC.

### Razorpay
1. Paste Key ID (`rzp_test_…`) and Key Secret, and choose **Razorpay** as the provider.
2. Recommended: Razorpay Dashboard → Webhooks → add the endpoint shown in Settings (`/api/webhooks/razorpay/<workspaceId>`) with events `order.paid` and `payment.captured`, and set a secret.
3. Use Razorpay's test-mode UPI IDs and cards from their docs.

Without webhooks, payments still register: Stripe on the success redirect (the session is verified server-side) and Razorpay via the checkout handler (signature verified, amount confirmed with Razorpay's API). Webhooks cover clients who close the tab mid-payment.

---

## How the pieces connect

```
Proposal (sent) ──client accepts──▶ Milestones created on the project (budget += proposal total)
Milestone: pending → in_progress → submitted ──client──▶ approved | changes_requested
Approved milestones + billable, unbilled time ──▶ Draft invoice ──send──▶ Portal "Pay now"
Stripe / Razorpay ──(redirect confirm or webhook)──▶ amount verified ──▶ Invoice paid + activity logged
```

## Project layout

```
prisma/
  schema.prisma             data model (money = integer minor units)
  seed.ts                   demo data
src/
  lib/                      db, auth (sessions), crypto, money, payments, rate limiting, tenant scoping
  server/                   server actions per domain (clients, projects, proposals, time, invoices, portal, settings)
  components/               UI kit, line-item editors, invoice/proposal documents, time forms
  app/(auth)/               login & sign-up
  app/(app)/                freelancer app (dashboard, clients, projects, proposals, time, invoices, settings)
  app/portal/[token]/       client portal
  app/api/webhooks/         Stripe + Razorpay webhooks (per workspace)
```

---

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server on :3000 |
| `npm run build` | Generate the Prisma client and build for production |
| `npm start` | Run the production build |
| `npm test` | Run unit tests (Vitest) |
| `npm run typecheck` | TypeScript check |
| `npm run db:push` | Sync the schema to the database |
| `npm run db:seed` | Load demo data (recreates the demo workspace) |
| `npm run db:studio` | Browse the database in Prisma Studio |

## Testing

```bash
npm test
```

Unit tests cover money parsing and rounding, tax, durations, encryption round-trips and tamper detection, and payment signature helpers (`src/lib/*.test.ts`).

---

## Security notes

- Sessions: random 256-bit token in an httpOnly cookie. Only the SHA-256 hash is stored. Expired sessions are deleted.
- Every freelancer query is scoped through the session's workspace (`src/lib/scope.ts`). A guessed ID from another tenant returns 404.
- Portal access uses 192-bit per-client tokens. You can regenerate or disable them per client.
- Payment secrets are encrypted at rest and never sent back to the browser (only masked).
- Webhooks verify signatures against the workspace's own secret. Payment marking is idempotent.
- A payment only settles an invoice if it is `sent` and the paid amount and currency equal the current total. Reverting to draft or voiding expires open Stripe sessions and drops Razorpay orders. Mismatched payments are logged to the activity feed for review.
- Invoice edits can only keep or drop existing milestone links, so they can't point at another project's or tenant's milestones.
- State changes (accept, approve, send, claim time entries) use conditional updates, so double-submits and races can't duplicate milestones or double-bill hours.
- Login is rate-limited per IP and per email, and response timing doesn't reveal which emails are registered.
- Security headers: `X-Frame-Options: DENY` / `frame-ancestors 'none'` (clickjacking), `nosniff`, a strict referrer policy (portal tokens are never leaked), and HSTS in production.
- Clients with sent or paid invoices can't be deleted, which preserves financial records.
- Input is validated server-side: non-negative amounts, 0–100% tax, 1 min – 24 h durations, and length caps.

---

## Production

1. In `prisma/schema.prisma`, set `provider = "postgresql"` and point `DATABASE_URL` at Postgres (Neon, Supabase, RDS…), then run `npx prisma db push` (or adopt `prisma migrate`).
2. Set `APP_SECRET`, `APP_URL` (your https domain), and `ALLOW_SIGNUP=false` if it's just for you.
3. `npm run build && npm start`, or deploy to Vercel/Render/Fly.
4. Register the webhook URLs from **Settings** with Stripe/Razorpay using your production domain.

## Troubleshooting

- **`EPERM: operation not permitted, rename … query_engine-windows.dll.node`** (Windows): a running dev server locks Prisma's engine. Stop `npm run dev`, then run `npx prisma generate`.
- **npm 11 warns "install scripts not yet covered by allowScripts"**: Prisma and esbuild need their install scripts. They're pre-approved in `package.json` (`allowScripts`). If you upgrade them, run `npm approve-scripts <pkg>`.
- **"Failed to decrypt a stored secret" in logs**: `APP_SECRET` changed. Re-enter payment keys in Settings.
- **Payments not marked paid**: check that the invoice is *Sent* (not draft), and look for a "doesn't match" alert in the activity feed (amount/currency mismatch).

## Known limitations

- Validation errors from form actions show a generic error page in production (Next.js hides server error messages). Converting forms to return inline errors is planned.
- The login rate limiter is in-memory. With multiple server instances, back it with Redis/Upstash.
- Dates are handled in UTC. There's no per-user timezone yet.
- Removing the "Hourly work" line from a draft invoice keeps its time entries linked to that invoice until the draft is deleted or voided.
- No email notifications yet. Share portal links manually.

## Roadmap to SaaS

- Transactional email (proposal sent, milestone submitted, invoice sent/overdue reminders) via Resend/Postmark
- Team members per workspace (the `Membership.role` field already exists)
- Subscription billing for the SaaS itself (`Workspace.plan` exists; gate limits by plan)
- Stripe Connect / Razorpay Route instead of pasted keys
- Recurring retainers, partial payments/deposits, expenses, file uploads on deliverables
- Server-side PDF generation, custom branding (logo/colors) on portal and invoices
