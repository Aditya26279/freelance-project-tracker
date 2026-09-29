import Link from "next/link";
import { db } from "@/lib/db";
import { getPortalClient } from "@/lib/portal";
import { formatMoney } from "@/lib/money";
import { formatDate, isOverdue } from "@/lib/utils";
import { Card, EmptyState, StatusBadge } from "@/components/ui";

export default async function PortalHome({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const client = await getPortalClient(token);
  const [proposals, pendingMilestones, projects, invoices] = await Promise.all([
    db.proposal.findMany({
      where: { clientId: client.id, status: "sent" },
      include: { items: { select: { amount: true } } },
    }),
    db.milestone.findMany({
      where: { status: "submitted", project: { clientId: client.id } },
      include: { project: { select: { id: true, name: true, currency: true } } },
    }),
    db.project.findMany({
      where: { clientId: client.id, status: { not: "archived" } },
      include: { milestones: { select: { status: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.invoice.findMany({
      where: { clientId: client.id, status: { in: ["sent", "paid"] } },
      orderBy: { issueDate: "desc" },
    }),
  ]);
  const unpaid = invoices.filter((i) => i.status === "sent");
  const base = `/portal/${token}`;
  const actionCount = proposals.length + pendingMilestones.length + unpaid.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Hi {client.name.split(" ")[0]} 👋</h1>
        <p className="mt-1 text-sm text-slate-500">
          {actionCount > 0
            ? `You have ${actionCount} item${actionCount > 1 ? "s" : ""} waiting for you.`
            : "You're all caught up."}
        </p>
      </div>

      {actionCount > 0 && (
        <Card title="Waiting for you" padded={false}>
          <ul className="divide-y divide-slate-100">
            {proposals.map((p) => (
              <li key={p.id}>
                <Link href={`${base}/proposals/${p.id}`} className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-slate-50">
                  <span>
                    <span className="text-sm font-medium">Review proposal: {p.title}</span>
                    <span className="block text-xs text-slate-500">
                      {formatMoney(p.items.reduce((s, i) => s + i.amount, 0), p.currency)}
                    </span>
                  </span>
                  <span className="btn-primary btn-sm">Review</span>
                </Link>
              </li>
            ))}
            {pendingMilestones.map((m) => (
              <li key={m.id}>
                <Link href={`${base}/projects/${m.project.id}#m-${m.id}`} className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-slate-50">
                  <span>
                    <span className="text-sm font-medium">Approve milestone: {m.title}</span>
                    <span className="block text-xs text-slate-500">{m.project.name}</span>
                  </span>
                  <span className="btn-primary btn-sm">Review</span>
                </Link>
              </li>
            ))}
            {unpaid.map((i) => (
              <li key={i.id}>
                <Link href={`${base}/invoices/${i.id}`} className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-slate-50">
                  <span>
                    <span className="text-sm font-medium">
                      Pay invoice {i.number}: {formatMoney(i.total, i.currency)}
                    </span>
                    <span className="block text-xs text-slate-500">
                      Due {formatDate(i.dueDate)} {isOverdue(i) && <StatusBadge status="overdue" />}
                    </span>
                  </span>
                  <span className="btn-success btn-sm">Pay</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Projects" padded={false}>
        {projects.length === 0 ? (
          <EmptyState title="No projects yet" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {projects.map((p) => {
              const done = p.milestones.filter((m) => m.status === "approved").length;
              const pct = p.milestones.length ? Math.round((done / p.milestones.length) * 100) : 0;
              return (
                <li key={p.id}>
                  <Link href={`${base}/projects/${p.id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50">
                    <span className="flex-1 text-sm font-medium">{p.name}</span>
                    <span className="hidden w-40 sm:block">
                      <span className="block h-1.5 rounded-full bg-slate-100">
                        <span className="block h-1.5 rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                      </span>
                      <span className="mt-1 block text-right text-xs text-slate-500">
                        {done}/{p.milestones.length} milestones
                      </span>
                    </span>
                    <StatusBadge status={p.status} />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {invoices.length > 0 && (
        <Card title="Invoices" padded={false}>
          <table className="table">
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id}>
                  <td>
                    <Link href={`${base}/invoices/${i.id}`} className="link font-mono">
                      {i.number}
                    </Link>
                  </td>
                  <td className="text-slate-500">{formatDate(i.issueDate)}</td>
                  <td className="text-right font-medium">{formatMoney(i.total, i.currency)}</td>
                  <td className="text-right">
                    <StatusBadge status={isOverdue(i) ? "overdue" : i.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
