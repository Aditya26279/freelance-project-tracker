import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatHours, formatMoney } from "@/lib/money";
import { formatDate, startOfTodayUTC, timeAgo } from "@/lib/utils";
import { Card, EmptyState, PageHeader, Stat, StatusBadge } from "@/components/ui";

export const metadata = { title: "Dashboard" };

function sumByCurrency(rows: { currency: string; total: number }[], fallback: string) {
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.currency, (map.get(r.currency) ?? 0) + r.total);
  if (map.size === 0) return formatMoney(0, fallback);
  return [...map].map(([c, v]) => formatMoney(v, c)).join(" · ");
}

export default async function Dashboard() {
  const { workspace, user } = await requireSession();
  const ws = workspace.id;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const [outstanding, paidThisMonth, unbilled, awaitingMilestones, awaitingProposals, actionMilestones, readyToInvoice, overdue, activity, projects] =
    await Promise.all([
      db.invoice.findMany({ where: { workspaceId: ws, status: "sent" }, select: { currency: true, total: true } }),
      db.invoice.findMany({
        where: { workspaceId: ws, status: "paid", paidAt: { gte: monthStart } },
        select: { currency: true, total: true },
      }),
      db.timeEntry.aggregate({
        where: { project: { workspaceId: ws }, billable: true, invoiceId: null, endedAt: { not: null } },
        _sum: { minutes: true },
      }),
      db.milestone.count({ where: { status: "submitted", project: { workspaceId: ws } } }),
      db.proposal.count({ where: { status: "sent", workspaceId: ws } }),
      db.milestone.findMany({
        where: { status: "changes_requested", project: { workspaceId: ws } },
        include: { project: { select: { id: true, name: true } } },
      }),
      db.milestone.findMany({
        where: { status: "approved", invoiceItem: null, amount: { gt: 0 }, project: { workspaceId: ws } },
        include: { project: { select: { id: true, name: true, currency: true } } },
      }),
      db.invoice.findMany({
        where: { workspaceId: ws, status: "sent", dueDate: { lt: startOfTodayUTC() } },
        include: { client: { select: { name: true } } },
      }),
      db.activity.findMany({
        where: { workspaceId: ws },
        orderBy: { createdAt: "desc" },
        take: 12,
        include: { project: { select: { id: true, name: true } } },
      }),
      db.project.findMany({
        where: { workspaceId: ws, status: "active" },
        include: {
          client: { select: { name: true } },
          milestones: { select: { status: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
    ]);

  const todo = [
    ...overdue.map((i) => ({
      key: i.id,
      href: `/invoices/${i.id}`,
      tone: "overdue",
      text: `Invoice ${i.number} for ${i.client.name} was due ${formatDate(i.dueDate)}`,
    })),
    ...actionMilestones.map((m) => ({
      key: m.id,
      href: `/projects/${m.project.id}`,
      tone: "changes_requested",
      text: `Changes requested on "${m.title}" (${m.project.name})`,
    })),
    ...readyToInvoice.map((m) => ({
      key: m.id,
      href: `/invoices/new?projectId=${m.project.id}`,
      tone: "approved",
      text: `"${m.title}" approved, ready to invoice ${formatMoney(m.amount, m.project.currency)}`,
    })),
  ];

  return (
    <>
      <PageHeader title={`Hi, ${user.name.split(" ")[0]}`} subtitle={workspace.name} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Outstanding" value={sumByCurrency(outstanding, workspace.currency)} hint={`${outstanding.length} unpaid invoice(s)`} href="/invoices?status=sent" />
        <Stat label="Paid this month" value={sumByCurrency(paidThisMonth, workspace.currency)} href="/invoices?status=paid" />
        <Stat label="Unbilled time" value={formatHours(unbilled._sum.minutes ?? 0)} hint="Billable, not yet invoiced" href="/time" />
        <Stat
          label="Awaiting client"
          value={awaitingMilestones + awaitingProposals}
          hint={`${awaitingMilestones} milestone(s) · ${awaitingProposals} proposal(s)`}
          href="/projects"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Needs your attention" padded={false}>
            {todo.length === 0 ? (
              <EmptyState title="All clear" body="Nothing overdue, no change requests, nothing waiting to be invoiced." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {todo.map((t) => (
                  <li key={t.key}>
                    <Link href={t.href} className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-slate-50">
                      <StatusBadge status={t.tone} />
                      <span>{t.text}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Active projects" actions={<Link href="/projects/new" className="btn-secondary btn-sm">New project</Link>} padded={false}>
            {projects.length === 0 ? (
              <EmptyState
                title="No active projects"
                body="Add a client, then create a project to start tracking."
                action={<Link href="/clients/new" className="btn-primary">Add a client</Link>}
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {projects.map((p) => {
                  const done = p.milestones.filter((m) => m.status === "approved").length;
                  const pct = p.milestones.length ? Math.round((done / p.milestones.length) * 100) : 0;
                  return (
                    <li key={p.id}>
                      <Link href={`/projects/${p.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{p.name}</p>
                          <p className="text-xs text-slate-500">{p.client.name}</p>
                        </div>
                        <div className="w-32">
                          <div className="h-1.5 rounded-full bg-slate-100">
                            <div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                          </div>
                          <p className="mt-1 text-right text-xs text-slate-500">
                            {done}/{p.milestones.length} milestones
                          </p>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <Card title="Recent activity" padded={false}>
          {activity.length === 0 ? (
            <EmptyState title="No activity yet" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {activity.map((a) => (
                <li key={a.id} className="px-5 py-3 text-sm">
                  <p>
                    {a.actor === "client" && <span className="font-medium text-amber-700">{a.actorName ?? "Client"}: </span>}
                    {a.message}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {a.project && (
                      <Link href={`/projects/${a.project.id}`} className="hover:underline">
                        {a.project.name}
                      </Link>
                    )}
                    {a.project && " · "}
                    {timeAgo(a.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
