import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { PROJECT_STATUSES, STATUS_LABELS } from "@/lib/constants";
import { formatMoney } from "@/lib/money";
import { formatDate, cn } from "@/lib/utils";
import { Card, EmptyState, PageHeader, StatusBadge } from "@/components/ui";

export const metadata = { title: "Projects" };

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { workspace } = await requireSession();
  const { status } = await searchParams;
  const filter = status && (PROJECT_STATUSES as readonly string[]).includes(status) ? status : undefined;

  const projects = await db.project.findMany({
    where: { workspaceId: workspace.id, ...(filter ? { status: filter } : { status: { not: "archived" } }) },
    include: {
      client: { select: { name: true } },
      milestones: { select: { status: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <PageHeader title="Projects" actions={<Link href="/projects/new" className="btn-primary">New project</Link>} />
      <div className="mb-4 flex flex-wrap gap-1">
        {[undefined, ...PROJECT_STATUSES].map((s) => (
          <Link
            key={s ?? "all"}
            href={s ? `/projects?status=${s}` : "/projects"}
            className={cn("btn-sm btn", filter === s ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-200")}
          >
            {s ? STATUS_LABELS[s] : "All open"}
          </Link>
        ))}
      </div>
      <Card padded={false}>
        {projects.length === 0 ? (
          <EmptyState title="No projects here" action={<Link href="/projects/new" className="btn-primary">Create a project</Link>} />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Billing</th>
                <th>Milestones</th>
                <th>Due</th>
                <th className="text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => {
                const awaiting = p.milestones.filter((m) => m.status === "submitted").length;
                const done = p.milestones.filter((m) => m.status === "approved").length;
                return (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td>
                      <Link href={`/projects/${p.id}`} className="link">
                        {p.name}
                      </Link>
                      <p className="text-xs text-slate-500">{p.client.name}</p>
                    </td>
                    <td className="text-slate-600">
                      {p.billingType === "hourly"
                        ? `${formatMoney(p.hourlyRate, p.currency)}/h`
                        : p.budget != null
                          ? formatMoney(p.budget, p.currency)
                          : "Fixed"}
                    </td>
                    <td>
                      {done}/{p.milestones.length}
                      {awaiting > 0 && (
                        <span className="ml-2">
                          <StatusBadge status="submitted" label={`${awaiting} awaiting`} />
                        </span>
                      )}
                    </td>
                    <td className="text-slate-600">{formatDate(p.dueDate)}</td>
                    <td className="text-right">
                      <StatusBadge status={p.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
