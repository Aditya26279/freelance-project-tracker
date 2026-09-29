import type { Client, Invoice, InvoiceItem, Proposal, ProposalItem, Workspace } from "@prisma/client";
import { formatMoney } from "@/lib/money";
import { formatDate, isOverdue } from "@/lib/utils";
import { StatusBadge } from "./ui";

/** Read-only proposal, shared by the freelancer view and the client portal. */
export function ProposalDocument({
  proposal,
  items,
  workspace,
  client,
}: {
  proposal: Proposal;
  items: ProposalItem[];
  workspace: Pick<Workspace, "name">;
  client: Pick<Client, "name" | "company">;
}) {
  const total = items.reduce((s, i) => s + i.amount, 0);
  return (
    <article className="card p-8">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Proposal</p>
          <h1 className="mt-1 text-2xl font-semibold">{proposal.title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            From {workspace.name} to {client.company ?? client.name}
            {proposal.validUntil && <> · valid until {formatDate(proposal.validUntil)}</>}
          </p>
        </div>
        <StatusBadge status={proposal.status} />
      </header>

      {proposal.summary && <div className="mt-6 whitespace-pre-line text-slate-700">{proposal.summary}</div>}

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">Scope & milestones</h2>
      <ol className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
        {items.map((it, i) => (
          <li key={it.id} className="flex gap-4 p-4">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{it.title}</p>
              {it.description && <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{it.description}</p>}
              {it.dueInDays != null && (
                <p className="mt-1 text-xs text-slate-500">Delivered within {it.dueInDays} days of acceptance</p>
              )}
            </div>
            <p className="whitespace-nowrap font-medium">{formatMoney(it.amount, proposal.currency)}</p>
          </li>
        ))}
        <li className="flex justify-between bg-slate-50 p-4 font-semibold">
          <span>Total</span>
          <span>{formatMoney(total, proposal.currency)}</span>
        </li>
      </ol>

      {proposal.terms && (
        <>
          <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">Terms</h2>
          <div className="mt-2 whitespace-pre-line text-sm text-slate-600">{proposal.terms}</div>
        </>
      )}

      {proposal.respondedAt && (
        <p className="mt-8 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
          {proposal.status === "accepted" ? "Accepted" : "Declined"} by <strong>{proposal.respondedByName}</strong> on{" "}
          {formatDate(proposal.respondedAt)}
          {proposal.responseNote && <span className="mt-1 block italic">&ldquo;{proposal.responseNote}&rdquo;</span>}
        </p>
      )}
    </article>
  );
}

/** Printable invoice, shared by the freelancer view and the client portal. */
export function InvoiceDocument({
  invoice,
  items,
  workspace,
  client,
}: {
  invoice: Invoice;
  items: InvoiceItem[];
  workspace: Workspace;
  client: Client;
}) {
  const m = (n: number) => formatMoney(n, invoice.currency);
  return (
    <article className="card p-8">
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="text-xl font-semibold">{workspace.name}</p>
          <div className="mt-1 whitespace-pre-line text-sm text-slate-500">
            {[workspace.address, workspace.businessEmail, workspace.taxId && `Tax ID: ${workspace.taxId}`]
              .filter(Boolean)
              .join("\n")}
          </div>
        </div>
        <div className="text-right">
          <p className="text-3xl font-light tracking-tight text-slate-400">INVOICE</p>
          <p className="mt-1 font-mono text-sm">{invoice.number}</p>
          <div className="mt-2">
            <StatusBadge status={isOverdue(invoice) ? "overdue" : invoice.status} />
          </div>
        </div>
      </header>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <div>
          <p className="label">Bill to</p>
          <p className="font-medium">{client.company ?? client.name}</p>
          <div className="whitespace-pre-line text-sm text-slate-600">
            {[client.company ? client.name : null, client.email, client.address].filter(Boolean).join("\n")}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm sm:text-right">
          <span className="text-slate-500">Issued</span>
          <span>{formatDate(invoice.issueDate)}</span>
          <span className="text-slate-500">Due</span>
          <span>{formatDate(invoice.dueDate)}</span>
          {invoice.paidAt && (
            <>
              <span className="text-slate-500">Paid</span>
              <span>{formatDate(invoice.paidAt)}</span>
            </>
          )}
        </div>
      </div>

      <table className="table mt-8">
        <thead>
          <tr>
            <th className="!px-0">Description</th>
            <th className="text-right">Qty</th>
            <th className="text-right">Unit</th>
            <th className="!pr-0 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id}>
              <td className="!px-0">{it.description}</td>
              <td className="text-right">{it.quantity}</td>
              <td className="text-right">{m(it.unitAmount)}</td>
              <td className="!pr-0 text-right font-medium">{m(it.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ml-auto mt-4 w-full max-w-xs space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-500">Subtotal</span>
          <span>{m(invoice.subtotal)}</span>
        </div>
        {invoice.taxBps > 0 && (
          <div className="flex justify-between">
            <span className="text-slate-500">Tax ({invoice.taxBps / 100}%)</span>
            <span>{m(invoice.tax)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-slate-200 pt-2 text-lg font-semibold">
          <span>Total due</span>
          <span>{m(invoice.total)}</span>
        </div>
      </div>

      {invoice.notes && <p className="mt-10 whitespace-pre-line border-t border-slate-100 pt-4 text-sm text-slate-500">{invoice.notes}</p>}
    </article>
  );
}
