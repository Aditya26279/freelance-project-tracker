import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { paymentConfig, settleStripeSession, stripeClient } from "@/lib/payments";

/**
 * Per-workspace Stripe webhook. Configure in Stripe → Developers → Webhooks:
 *   URL:    {APP_URL}/api/webhooks/stripe/{workspaceId}
 *   Events: checkout.session.completed, checkout.session.async_payment_succeeded
 */
export async function POST(req: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const ws = await db.workspace.findUnique({ where: { id: workspaceId } });
  const cfg = ws ? paymentConfig(ws).stripe : null;
  if (!ws || !cfg?.secretKey || !cfg.webhookSecret) {
    return NextResponse.json({ error: "not configured" }, { status: 400 });
  }

  const raw = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";
  let event: Stripe.Event;
  try {
    event = stripeClient(cfg.secretKey).webhooks.constructEvent(raw, sig, cfg.webhookSecret);
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    await settleStripeSession(ws, event.data.object);
  }
  return NextResponse.json({ received: true });
}
