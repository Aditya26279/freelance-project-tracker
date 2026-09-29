import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { INVOICE_STATUSES, STATUS_LABELS } from "@/lib/constants";
import { formatMoney } from "@/lib/money";
import { cn, formatDate, isOverdue } from "@/lib/utils";
import { Card, EmptyState, PageHeader, StatusBadge } from "@/components/ui";

export const metadata = { title: "Invoices" };

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { workspace } = await requireSession();
  const { status } = await searchParams;
  const filter = status && (INVOICE_STATUSES as readonly string[]).includes(status) ? status : undefined;
  const invoices = await db.invoice.findMany({
    where: { workspaceId: workspace.id, ...(filter ? { status: filter } : {}) },
    orderBy: { createdAt: "desc" },
    include: { client: { select: { name: true } }, project: { select: { name: true } } },
  });

  return (
    <>
      <PageHeader
        title="Invoices"
        actions={<Link href="/invoices/new" className="btn-primary">New invoice</Link>}
      />
      <div className="mb-4 flex flex-wrap gap-1">
        {[undefined, ...INVOICE_STATUSES].map((s) => (
          <Link
            key={s ?? "all"}
            href={s ? `/invoices?status=${s}` : "/invoices"}
            className={cn("btn btn-sm", filter === s ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-200")}
          >
            {s ? STATUS_LABELS[s] : "All"}
          </Link>
        ))}
      </div>
      <Card padded={false}>
        {invoices.length === 0 ? (
          <EmptyState
            title="No invoices"
            body="Invoice approved milestones and unbilled hours from any project."
            action={<Link href="/invoices/new" className="btn-primary">Create invoice</Link>}
          />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Number</th>
                <th>Client</th>
                <th>Issued</th>
                <th>Due</th>
                <th className="text-right">Total</th>
                <th className="text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id} className="hover:bg-slate-50">
                  <td>
                    <Link href={`/invoices/${i.id}`} className="link font-mono">
                      {i.number}
                    </Link>
                  </td>
                  <td>
                    {i.client.name}
                    {i.project && <p className="text-xs text-slate-500">{i.project.name}</p>}
                  </td>
                  <td className="text-slate-600">{formatDate(i.issueDate)}</td>
                  <td className="text-slate-600">{formatDate(i.dueDate)}</td>
                  <td className="text-right font-medium">{formatMoney(i.total, i.currency)}</td>
                  <td className="text-right">
                    <StatusBadge status={isOverdue(i) ? "overdue" : i.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
