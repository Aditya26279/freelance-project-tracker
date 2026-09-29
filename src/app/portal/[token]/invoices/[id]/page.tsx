import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getPortalClient } from "@/lib/portal";
import { formatMoney } from "@/lib/money";
import { canAcceptPayments, confirmStripeSession } from "@/lib/payments";
import { payWithStripe } from "@/server/portal";
import { Card, Notice } from "@/components/ui";
import { PrintButton, SubmitButton } from "@/components/client";
import { InvoiceDocument } from "@/components/documents";
import { RazorpayButton } from "./RazorpayButton";

export default async function PortalInvoice({
  params,
  searchParams,
}: {
  params: Promise<{ token: string; id: string }>;
  searchParams: Promise<{ session_id?: string; cancelled?: string }>;
}) {
  const { token, id } = await params;
  const { session_id, cancelled } = await searchParams;
  const client = await getPortalClient(token);

  const where = { id, clientId: client.id, status: { in: ["sent", "paid"] } };
  let invoice = await db.invoice.findFirst({ where, include: { items: { orderBy: { position: "asc" } } } });
  if (!invoice) notFound();

  // Returning from Stripe Checkout: confirm directly so we don't depend on webhooks.
  let confirmError = false;
  if (session_id && invoice.status === "sent" && session_id === invoice.stripeSessionId) {
    try {
      if (await confirmStripeSession(client.workspace, invoice.id, session_id)) {
        invoice = await db.invoice.findFirstOrThrow({ where, include: { items: { orderBy: { position: "asc" } } } });
      }
    } catch {
      confirmError = true;
    }
  }

  const ws = client.workspace;
  const payable = invoice.status === "sent" && canAcceptPayments(ws);

  return (
    <div className="space-y-6">
      <div className="no-print flex items-center justify-between">
        <Link href={`/portal/${token}`} className="text-sm text-slate-500 hover:text-slate-700">
          ← Back
        </Link>
        <PrintButton />
      </div>

      <div className="no-print space-y-3">
        {invoice.status === "paid" && (
          <Notice tone="success">Payment received. Thank you! A copy of this invoice is available here any time.</Notice>
        )}
        {cancelled && invoice.status === "sent" && <Notice tone="warn">Payment was cancelled. You can try again below.</Notice>}
        {session_id && invoice.status === "sent" && !confirmError && (
          <Notice>We&apos;re confirming your payment. Refresh in a moment.</Notice>
        )}
        {confirmError && <Notice tone="error">We couldn&apos;t confirm the payment automatically. If you were charged, it will update shortly.</Notice>}
      </div>

      {invoice.status === "sent" && (
        <Card className="no-print">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm text-slate-500">Amount due</p>
              <p className="text-3xl font-semibold tracking-tight">{formatMoney(invoice.total, invoice.currency)}</p>
            </div>
            {payable && ws.paymentProvider === "stripe" && (
              <form action={payWithStripe.bind(null, token, id)}>
                <SubmitButton className="btn-success px-6 py-3 text-base" pendingText="Redirecting…">
                  Pay now with card
                </SubmitButton>
              </form>
            )}
            {payable && ws.paymentProvider === "razorpay" && <RazorpayButton token={token} invoiceId={id} />}
            {!payable && <p className="max-w-xs text-sm text-slate-500">Please pay using the instructions on the invoice.</p>}
          </div>
        </Card>
      )}

      <InvoiceDocument invoice={invoice} items={invoice.items} workspace={ws} client={client} />
    </div>
  );
}
