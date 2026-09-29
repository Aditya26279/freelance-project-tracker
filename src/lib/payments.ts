import "server-only";
import Stripe from "stripe";
import type { Invoice, Workspace } from "@prisma/client";
import { db } from "./db";
import { hmacSha256Hex, safeDecrypt, safeEqual } from "./crypto";
import { logActivity } from "./activity";
import { appUrl } from "./utils";

/**
 * Each workspace brings its own Stripe / Razorpay keys (stored encrypted), so money
 * goes straight to the freelancer's account. This is what makes the app multi-tenant.
 */
export function paymentConfig(ws: Workspace) {
  return {
    provider: ws.paymentProvider as "none" | "stripe" | "razorpay",
    stripe: {
      secretKey: safeDecrypt(ws.stripeSecretKeyEnc),
      webhookSecret: safeDecrypt(ws.stripeWebhookSecretEnc),
    },
    razorpay: {
      keyId: ws.razorpayKeyId,
      keySecret: safeDecrypt(ws.razorpayKeySecretEnc),
      webhookSecret: safeDecrypt(ws.razorpayWebhookSecretEnc),
    },
  };
}

export function canAcceptPayments(ws: Workspace): boolean {
  const cfg = paymentConfig(ws);
  if (ws.paymentProvider === "stripe") return !!cfg.stripe.secretKey;
  if (ws.paymentProvider === "razorpay") return !!cfg.razorpay.keyId && !!cfg.razorpay.keySecret;
  return false;
}

export function stripeClient(secretKey: string) {
  return new Stripe(secretKey);
}

/**
 * Idempotent: only the first call flips the invoice to paid.
 * Online payments only settle invoices that are currently "sent"; a draft (possibly
 * being edited) or a voided invoice is never marked paid by a provider.
 */
export async function markInvoicePaid(
  invoiceId: string,
  provider: "stripe" | "razorpay" | "manual",
  paymentRef: string | null,
) {
  const allowed = provider === "manual" ? ["sent", "draft"] : ["sent"];
  const res = await db.invoice.updateMany({
    where: { id: invoiceId, status: { in: allowed } },
    data: { status: "paid", paidAt: new Date(), paymentProvider: provider, paymentRef },
  });
  if (res.count === 0) return false;
  const inv = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  await logActivity({
    workspaceId: inv.workspaceId,
    projectId: inv.projectId,
    actor: provider === "manual" ? "freelancer" : "client",
    message: `Invoice ${inv.number} paid${provider === "manual" ? " (marked manually)" : ` via ${provider}`}`,
  });
  return true;
}

/** A payment only settles an invoice if it was for exactly the invoice's current amount. */
function amountMatches(inv: Invoice, amount: number | null | undefined, currency: string | null | undefined) {
  return amount === inv.total && (currency ?? "").toUpperCase() === inv.currency.toUpperCase();
}

async function logMismatch(inv: Invoice, provider: string, ref: string, amount: number | null | undefined) {
  console.warn(`[payments] ${provider} payment ${ref} for invoice ${inv.id} did not match (amount ${amount} vs ${inv.total}).`);
  await logActivity({
    workspaceId: inv.workspaceId,
    projectId: inv.projectId,
    actor: "system",
    message: `Received a ${provider} payment (${ref}) for ${inv.number} that doesn't match the current invoice total/state. Please review.`,
  });
}

/** Clear any open checkout references, e.g. when an invoice goes back to draft or is voided. */
export async function invalidateCheckouts(inv: Invoice, ws: Workspace) {
  if (inv.stripeSessionId) await expireStripeSession(ws, inv.stripeSessionId);
  await db.invoice.update({ where: { id: inv.id }, data: { stripeSessionId: null, razorpayOrderId: null } });
}

// ---------------------------------------------------------------- Stripe

async function expireStripeSession(ws: Workspace, sessionId: string) {
  const { stripe: cfg } = paymentConfig(ws);
  if (!cfg.secretKey) return;
  try {
    await stripeClient(cfg.secretKey).checkout.sessions.expire(sessionId);
  } catch {
    // Already completed/expired, or not found: nothing to do.
  }
}

export async function createStripeCheckout(
  ws: Workspace,
  invoice: Invoice & { client: { email: string | null; portalToken: string } },
) {
  const { stripe: cfg } = paymentConfig(ws);
  if (!cfg.secretKey) throw new Error("Stripe is not configured for this workspace");
  const stripe = stripeClient(cfg.secretKey);

  // Only one open checkout per invoice, so the client can't pay twice via two tabs.
  if (invoice.stripeSessionId) await expireStripeSession(ws, invoice.stripeSessionId);

  const base = appUrl(`/portal/${invoice.client.portalToken}/invoices/${invoice.id}`);
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: invoice.client.email ?? undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: invoice.currency.toLowerCase(),
          unit_amount: invoice.total,
          product_data: { name: `Invoice ${invoice.number} — ${ws.name}` },
        },
      },
    ],
    metadata: { invoiceId: invoice.id, workspaceId: ws.id },
    payment_intent_data: { metadata: { invoiceId: invoice.id, workspaceId: ws.id } },
    success_url: `${base}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}?cancelled=1`,
  });
  await db.invoice.update({ where: { id: invoice.id }, data: { stripeSessionId: session.id } });
  return session.url!;
}

/** Shared by the success redirect and the webhook. Returns true if the invoice became paid. */
export async function settleStripeSession(ws: Workspace, session: Stripe.Checkout.Session) {
  const invoiceId = session.metadata?.invoiceId;
  if (!invoiceId || session.metadata?.workspaceId !== ws.id || session.payment_status !== "paid") return false;
  const inv = await db.invoice.findFirst({ where: { id: invoiceId, workspaceId: ws.id } });
  if (!inv) return false;
  const ref = typeof session.payment_intent === "string" ? session.payment_intent : session.id;
  if (inv.status === "paid") return false;
  if (inv.status !== "sent" || !amountMatches(inv, session.amount_total, session.currency)) {
    await logMismatch(inv, "Stripe", ref, session.amount_total);
    return false;
  }
  return markInvoicePaid(inv.id, "stripe", ref);
}

/** Called on the success redirect so payment registers even without webhooks (e.g. localhost). */
export async function confirmStripeSession(ws: Workspace, invoiceId: string, sessionId: string) {
  const { stripe: cfg } = paymentConfig(ws);
  if (!cfg.secretKey || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return false;
  const session = await stripeClient(cfg.secretKey).checkout.sessions.retrieve(sessionId);
  if (session.metadata?.invoiceId !== invoiceId) return false;
  return settleStripeSession(ws, session);
}

// ---------------------------------------------------------------- Razorpay

function razorpayAuth(keyId: string, keySecret: string) {
  return "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");
}

export async function createRazorpayOrder(ws: Workspace, invoice: Invoice) {
  const { razorpay: cfg } = paymentConfig(ws);
  if (!cfg.keyId || !cfg.keySecret) throw new Error("Razorpay is not configured for this workspace");

  // Reuse the open order: it is cleared whenever the invoice is edited/voided, so its
  // amount always equals the current total. Reuse also means paying an earlier-opened
  // checkout still verifies.
  if (invoice.razorpayOrderId) {
    return { orderId: invoice.razorpayOrderId, amount: invoice.total, currency: invoice.currency, keyId: cfg.keyId };
  }

  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: razorpayAuth(cfg.keyId, cfg.keySecret) },
    body: JSON.stringify({
      amount: invoice.total,
      currency: invoice.currency,
      receipt: invoice.number.slice(0, 40),
      notes: { invoiceId: invoice.id, workspaceId: ws.id },
    }),
  });
  if (!res.ok) {
    console.error(`[payments] Razorpay order failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
    throw new Error("Could not start the payment. Please try again later.");
  }
  const order = (await res.json()) as { id: string; amount: number; currency: string };
  // Guard against a concurrent click creating a second order.
  const saved = await db.invoice.updateMany({
    where: { id: invoice.id, razorpayOrderId: null },
    data: { razorpayOrderId: order.id },
  });
  if (saved.count === 0) {
    const current = await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    return { orderId: current.razorpayOrderId!, amount: invoice.total, currency: invoice.currency, keyId: cfg.keyId };
  }
  return { orderId: order.id, amount: order.amount, currency: order.currency, keyId: cfg.keyId };
}

/** Settle an invoice from a Razorpay order/payment after amount + state checks. */
export async function settleRazorpayPayment(
  inv: Invoice,
  paymentId: string | null,
  amount: number | null | undefined,
  currency: string | null | undefined,
) {
  if (inv.status === "paid") return false;
  if (inv.status !== "sent" || !amountMatches(inv, amount, currency)) {
    await logMismatch(inv, "Razorpay", paymentId ?? "unknown", amount);
    return false;
  }
  return markInvoicePaid(inv.id, "razorpay", paymentId);
}

/** Fetch a payment from Razorpay to learn its real amount/status (never trust the browser). */
export async function fetchRazorpayPayment(ws: Workspace, paymentId: string) {
  const { razorpay: cfg } = paymentConfig(ws);
  if (!cfg.keyId || !cfg.keySecret || !/^pay_[A-Za-z0-9]+$/.test(paymentId)) return null;
  const res = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
    headers: { Authorization: razorpayAuth(cfg.keyId, cfg.keySecret) },
  });
  if (!res.ok) return null;
  return (await res.json()) as { id: string; order_id: string; amount: number; currency: string; status: string };
}

/** Checkout handler signature: HMAC_SHA256(order_id + "|" + payment_id, key_secret). */
export function verifyRazorpayPaymentSignature(
  keySecret: string,
  orderId: string,
  paymentId: string,
  signature: string,
) {
  return safeEqual(hmacSha256Hex(keySecret, `${orderId}|${paymentId}`), signature);
}

/** Webhook signature: HMAC_SHA256(raw body, webhook secret). */
export function verifyRazorpayWebhookSignature(webhookSecret: string, rawBody: string, signature: string) {
  return safeEqual(hmacSha256Hex(webhookSecret, rawBody), signature);
}
