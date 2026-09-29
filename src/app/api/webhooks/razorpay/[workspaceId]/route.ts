import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { paymentConfig, settleRazorpayPayment, verifyRazorpayWebhookSignature } from "@/lib/payments";

type RazorpayEvent = {
  event: string;
  payload?: {
    payment?: { entity: { id: string; order_id: string; status: string; amount: number; currency: string } };
    order?: { entity: { id: string; amount_paid?: number; currency?: string } };
  };
};

/**
 * Per-workspace Razorpay webhook. Configure in Razorpay Dashboard → Webhooks:
 *   URL:    {APP_URL}/api/webhooks/razorpay/{workspaceId}
 *   Events: order.paid, payment.captured
 * This is the safety net if the client closes the tab before the checkout callback fires.
 */
export async function POST(req: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const ws = await db.workspace.findUnique({ where: { id: workspaceId } });
  const secret = ws ? paymentConfig(ws).razorpay.webhookSecret : null;
  if (!ws || !secret) return NextResponse.json({ error: "not configured" }, { status: 400 });

  const raw = await req.text();
  const sig = req.headers.get("x-razorpay-signature") ?? "";
  if (!verifyRazorpayWebhookSignature(secret, raw, sig)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  let event: RazorpayEvent;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  if (event.event === "order.paid" || event.event === "payment.captured") {
    const payment = event.payload?.payment?.entity;
    const order = event.payload?.order?.entity;
    const orderId = order?.id ?? payment?.order_id;
    if (orderId) {
      const inv = await db.invoice.findFirst({ where: { razorpayOrderId: orderId, workspaceId } });
      if (inv) {
        await settleRazorpayPayment(
          inv,
          payment?.id ?? null,
          payment?.amount ?? order?.amount_paid,
          payment?.currency ?? order?.currency,
        );
      }
    }
  }
  return NextResponse.json({ received: true });
}
