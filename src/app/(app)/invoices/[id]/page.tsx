import Link from "next/link";
import { db } from "@/lib/db";
import { ownedInvoice } from "@/lib/scope";
import { formatMoney, toInputAmount } from "@/lib/money";
import { appUrl, formatDateTime, toDateInput } from "@/lib/utils";
import { canAcceptPayments } from "@/lib/payments";
import {
  deleteInvoice,
  markInvoicePaidManually,
  revertInvoiceToDraft,
  saveInvoice,
  voidInvoice,
} from "@/server/invoices";
import { Card, Field, Notice, PageHeader, StatusBadge } from "@/components/ui";
import { CopyButton, PrintButton, SubmitButton } from "@/components/client";
import { InvoiceItemsEditor } from "@/components/line-items";
import { InvoiceDocument } from "@/components/documents";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await ownedInvoice(id);
  const inv = await db.invoice.findUniqueOrThrow({
    where: { id },
    include: {
      items: { orderBy: { position: "asc" } },
      client: true,
      workspace: true,
      project: { select: { id: true, name: true } },
      _count: { select: { timeEntries: true } },
    },
  });
  const portalUrl = appUrl(`/portal/${inv.client.portalToken}/invoices/${inv.id}`);
  const payable = canAcceptPayments(inv.workspace);

  return (
    <>
      <div className="no-print">
        <PageHeader
          title={
            <span className="flex items-center gap-3">
              Invoice {inv.number} <StatusBadge status={inv.status} />
            </span>
          }
          subtitle={
            <>
              {inv.client.name}
              {inv.project && (
                <>
                  {" · "}
                  <Link href={`/projects/${inv.project.id}`} className="hover:underline">
                    {inv.project.name}
                  </Link>
                </>
              )}
            </>
          }
          back={{ href: "/invoices", label: "Invoices" }}
          actions={
            inv.status !== "draft" && (
              <>
                <CopyButton text={portalUrl} label="Copy payment link" />
                <PrintButton />
              </>
            )
          }
        />
      </div>

      {inv.status === "draft" ? (
        <form action={saveInvoice.bind(null, id)} className="space-y-6">
          {!payable && (
            <Notice tone="warn">
              Online payments aren&apos;t set up yet, so clients will only see bank/manual instructions.{" "}
              <Link href="/settings#payments" className="font-medium underline">
                Connect Stripe or Razorpay →
              </Link>
            </Notice>
          )}
          <Card title="Line items">
            <InvoiceItemsEditor
              currency={inv.currency}
              initialTax={String(inv.taxBps / 100)}
              initial={inv.items.map((it) => ({
                description: it.description,
                quantity: String(it.quantity),
                unit: toInputAmount(it.unitAmount),
                milestoneId: it.milestoneId ?? "",
              }))}
            />
            {inv._count.timeEntries > 0 && (
              <p className="mt-3 text-xs text-slate-500">{inv._count.timeEntries} time entries are linked to this invoice.</p>
            )}
          </Card>
          <Card title="Details">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Issue date">
                <input name="issueDate" type="date" defaultValue={toDateInput(inv.issueDate)} className="input" />
              </Field>
              <Field label="Due date">
                <input name="dueDate" type="date" defaultValue={toDateInput(inv.dueDate)} className="input" />
              </Field>
              <Field label="Notes / payment instructions" className="sm:col-span-2">
                <textarea name="notes" rows={3} defaultValue={inv.notes ?? ""} className="input" />
              </Field>
            </div>
          </Card>
          <div className="flex flex-wrap gap-2">
            <SubmitButton className="btn-secondary">Save draft</SubmitButton>
            <SubmitButton name="intent" value="send" pendingText="Sending…" confirm="Finalize and send this invoice to the client portal?">
              Save & send
            </SubmitButton>
          </div>
        </form>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
          <InvoiceDocument invoice={inv} items={inv.items} workspace={inv.workspace} client={inv.client} />
          <div className="no-print space-y-4">
            {inv.status === "sent" && (
              <Card title="Get paid">
                <p className="text-sm text-slate-600">
                  {payable
                    ? `Your client can pay ${formatMoney(inv.total, inv.currency)} online via ${inv.workspace.paymentProvider === "stripe" ? "Stripe" : "Razorpay"} from their portal.`
                    : "Online payments are not configured. Share the invoice and mark it paid when you receive funds."}
                </p>
                <div className="mt-3">
                  <CopyButton text={portalUrl} label="Copy payment link" />
                </div>
                <details className="mt-4 border-t border-slate-100 pt-4">
                  <summary className="cursor-pointer text-sm font-medium">Mark as paid manually</summary>
                  <form action={markInvoicePaidManually.bind(null, id)} className="mt-2 space-y-2">
                    <input name="reference" placeholder="Reference (bank txn, cheque…)" className="input" />
                    <SubmitButton className="btn-success btn-sm">Mark paid</SubmitButton>
                  </form>
                </details>
              </Card>
            )}
            {inv.status === "paid" && (
              <Card title="Payment">
                <p className="text-sm">
                  Paid {formatDateTime(inv.paidAt)} via <strong>{inv.paymentProvider}</strong>
                </p>
                {inv.paymentRef && <p className="mt-1 break-all font-mono text-xs text-slate-500">{inv.paymentRef}</p>}
              </Card>
            )}
            {(inv.status === "sent" || inv.status === "void") && (
              <Card title="Actions">
                <div className="flex flex-col items-start gap-2">
                  {inv.status === "sent" && (
                    <form action={revertInvoiceToDraft.bind(null, id)}>
                      <SubmitButton className="btn-ghost btn-sm">Back to draft</SubmitButton>
                    </form>
                  )}
                  {inv.status === "sent" && (
                    <form action={voidInvoice.bind(null, id)}>
                      <SubmitButton
                        className="btn-ghost btn-sm text-red-600"
                        confirm="Void this invoice? Linked milestones and time will become billable again."
                      >
                        Void invoice
                      </SubmitButton>
                    </form>
                  )}
                  {inv.status === "void" && <p className="text-sm text-slate-500">This invoice was voided.</p>}
                </div>
              </Card>
            )}
          </div>
        </div>
      )}

      {inv.status === "draft" && (
        <form action={deleteInvoice.bind(null, id)} className="mt-8">
          <SubmitButton className="btn-ghost text-red-600" confirm="Delete this draft? Linked time entries become unbilled again.">
            Delete draft
          </SubmitButton>
        </form>
      )}
    </>
  );
}
