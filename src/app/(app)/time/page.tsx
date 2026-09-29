import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatHours } from "@/lib/money";
import { cn, formatDate } from "@/lib/utils";
import { deleteTimeEntry, toggleBillable } from "@/server/time";
import { Card, EmptyState, PageHeader, Stat, StatusBadge } from "@/components/ui";
import { ManualTimeForm, StartTimerForm } from "@/components/time-forms";

export const metadata = { title: "Time" };

function startOfWeek(d = new Date()) {
  const r = new Date(d);
  const day = (r.getDay() + 6) % 7; // Monday = 0
  r.setDate(r.getDate() - day);
  r.setHours(0, 0, 0, 0);
  return r;
}

export default async function TimePage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string; filter?: string }>;
}) {
  const { workspace, user } = await requireSession();
  const { projectId, filter } = await searchParams;

  const projects = await db.project.findMany({
    where: { workspaceId: workspace.id, status: { in: ["active", "on_hold"] } },
    select: {
      id: true,
      name: true,
      milestones: { where: { status: { not: "approved" } }, select: { id: true, title: true } },
    },
    orderBy: { name: "asc" },
  });

  const where = {
    userId: user.id,
    project: { workspaceId: workspace.id },
    ...(projectId ? { projectId } : {}),
    ...(filter === "unbilled" ? { billable: true, invoiceId: null } : {}),
  };
  const weekStart = startOfWeek();
  const [entries, week, unbilled] = await Promise.all([
    db.timeEntry.findMany({
      where,
      orderBy: { startedAt: "desc" },
      take: 200,
      include: { project: { select: { id: true, name: true } }, milestone: { select: { title: true } } },
    }),
    db.timeEntry.aggregate({
      where: { userId: user.id, project: { workspaceId: workspace.id }, startedAt: { gte: weekStart }, endedAt: { not: null } },
      _sum: { minutes: true },
    }),
    db.timeEntry.aggregate({
      where: { userId: user.id, project: { workspaceId: workspace.id }, billable: true, invoiceId: null, endedAt: { not: null } },
      _sum: { minutes: true },
    }),
  ]);

  // Group by (UTC) calendar day, matching how dates are stored and formatted.
  const days = new Map<string, typeof entries>();
  for (const e of entries) {
    const k = e.startedAt.toISOString().slice(0, 10);
    days.set(k, [...(days.get(k) ?? []), e]);
  }

  const filterLink = (label: string, params: Record<string, string | undefined>) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString();
    const active = (params.filter ?? "") === (filter ?? "") && (params.projectId ?? "") === (projectId ?? "");
    return (
      <Link
        key={label}
        href={`/time${q ? `?${q}` : ""}`}
        className={cn("btn btn-sm", active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-200")}
      >
        {label}
      </Link>
    );
  };
  const currentProject = projects.find((p) => p.id === projectId);

  return (
    <>
      <PageHeader title="Time" subtitle={currentProject ? `Filtered to ${currentProject.name}` : undefined} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Stat label="This week" value={formatHours(week._sum.minutes ?? 0)} />
        <Stat label="Unbilled (billable)" value={formatHours(unbilled._sum.minutes ?? 0)} href="/time?filter=unbilled" />
      </div>

      <Card className="mt-6" title="Track time">
        {projects.length === 0 ? (
          <EmptyState title="No active projects" action={<Link href="/projects/new" className="btn-primary">Create a project</Link>} />
        ) : (
          <div className="space-y-4">
            <StartTimerForm projects={projects} />
            <div className="border-t border-slate-100 pt-4">
              <p className="label">Or log time manually</p>
              <ManualTimeForm projects={projects} />
            </div>
          </div>
        )}
      </Card>

      <div className="mb-3 mt-6 flex flex-wrap gap-1">
        {filterLink("All", {})}
        {filterLink("Unbilled", { filter: "unbilled" })}
        {currentProject && filterLink(currentProject.name, { projectId })}
      </div>

      {entries.length === 0 ? (
        <Card>
          <EmptyState title="No time entries" body="Start a timer above to begin tracking." />
        </Card>
      ) : (
        <div className="space-y-4">
          {[...days].map(([day, list]) => (
            <Card
              key={day}
              padded={false}
              title={formatDate(`${day}T00:00:00Z`)}
              actions={<span className="text-sm font-medium text-slate-600">{formatHours(list.reduce((s, e) => s + e.minutes, 0))}</span>}
            >
              <table className="table">
                <tbody>
                  {list.map((e) => (
                    <tr key={e.id}>
                      <td className="w-1/4">
                        <Link href={`/projects/${e.project.id}`} className="link">
                          {e.project.name}
                        </Link>
                      </td>
                      <td>
                        {e.description ?? <span className="text-slate-400">No description</span>}
                        {e.milestone && <span className="text-xs text-slate-500"> · {e.milestone.title}</span>}
                      </td>
                      <td className="whitespace-nowrap font-medium">
                        {e.endedAt ? formatHours(e.minutes) : <StatusBadge status="in_progress" label="Running" />}
                      </td>
                      <td className="whitespace-nowrap text-right">
                        {e.invoiceId ? (
                          <Link href={`/invoices/${e.invoiceId}`} className="text-xs text-slate-500 hover:underline">
                            Invoiced
                          </Link>
                        ) : (
                          <span className="inline-flex gap-1">
                            <form action={toggleBillable.bind(null, e.id)}>
                              <button className={cn("btn-ghost btn-sm", !e.billable && "text-slate-400")}>
                                {e.billable ? "Billable" : "Non-billable"}
                              </button>
                            </form>
                            <form action={deleteTimeEntry.bind(null, e.id)}>
                              <button className="btn-ghost btn-sm text-red-600" aria-label="Delete entry">
                                ✕
                              </button>
                            </form>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
