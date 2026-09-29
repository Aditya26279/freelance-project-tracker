import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getPortalClient } from "@/lib/portal";
import { formatHours, formatMoney } from "@/lib/money";
import { formatDate, isOverdue } from "@/lib/utils";
import { approveMilestone, requestMilestoneChanges } from "@/server/portal";
import { Card, EmptyState, Notice, StatusBadge } from "@/components/ui";
import { SubmitButton } from "@/components/client";

/** Turn bare URLs in deliverable notes into links. */
function Linkify({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="link break-all">
            {p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

export default async function PortalProject({ params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const client = await getPortalClient(token);
  const project = await db.project.findFirst({
    where: { id, clientId: client.id },
    include: {
      milestones: { orderBy: { position: "asc" } },
      proposals: { where: { status: { not: "draft" } }, orderBy: { createdAt: "desc" } },
      invoices: { where: { status: { in: ["sent", "paid"] } }, orderBy: { issueDate: "desc" } },
    },
  });
  if (!project) notFound();
  const hours = project.billingType === "hourly"
    ? await db.timeEntry.aggregate({ where: { projectId: id, billable: true, endedAt: { not: null } }, _sum: { minutes: true } })
    : null;
  const base = `/portal/${token}`;
  const money = (n: number) => formatMoney(n, project.currency);

  return (
    <div className="space-y-6">
      <div>
        <Link href={base} className="text-sm text-slate-500 hover:text-slate-700">
          ← All projects
        </Link>
        <h1 className="mt-2 flex items-center gap-3 text-2xl font-semibold">
          {project.name} <StatusBadge status={project.status} />
        </h1>
        {project.description && <p className="mt-2 whitespace-pre-line text-sm text-slate-600">{project.description}</p>}
        <p className="mt-2 text-sm text-slate-500">
          {project.budget != null && <>Budget {money(project.budget)} · </>}
          {project.dueDate && <>Target date {formatDate(project.dueDate)} · </>}
          {hours && <>{formatHours(hours._sum.minutes ?? 0)} billable time logged</>}
        </p>
      </div>

      <Card title="Milestones" padded={false}>
        {project.milestones.length === 0 ? (
          <EmptyState title="No milestones yet" />
        ) : (
          <ol className="divide-y divide-slate-100">
            {project.milestones.map((m, idx) => (
              <li key={m.id} id={`m-${m.id}`} className="scroll-mt-6 px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {idx + 1}. {m.title}
                    </p>
                    <p className="text-xs text-slate-500">
                      {m.amount > 0 && <>{money(m.amount)} · </>}
                      {m.dueDate ? `Due ${formatDate(m.dueDate)}` : "No due date"}
                      {m.approvedAt && ` · Approved by ${m.approvedBy} on ${formatDate(m.approvedAt)}`}
                    </p>
                    {m.description && <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{m.description}</p>}
                  </div>
                  <StatusBadge status={m.status} />
                </div>

                {m.status === "submitted" && (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/50 p-4">
                    <p className="text-sm font-medium text-amber-900">Ready for your review</p>
                    {m.deliverable && (
                      <p className="mt-1 whitespace-pre-line text-sm text-slate-700">
                        <Linkify text={m.deliverable} />
                      </p>
                    )}
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <form action={approveMilestone.bind(null, token, m.id)} className="space-y-2">
                        <input name="signerName" defaultValue={client.name} required className="input" placeholder="Your name" />
                        <input name="note" className="input" placeholder="Optional comment" />
                        <SubmitButton className="btn-success w-full" confirm={`Approve "${m.title}"?`} pendingText="Approving…">
                          ✓ Approve milestone
                        </SubmitButton>
                      </form>
                      <form action={requestMilestoneChanges.bind(null, token, m.id)} className="space-y-2">
                        <input type="hidden" name="signerName" value={client.name} />
                        <textarea name="note" required rows={3} className="input" placeholder="What needs to change?" />
                        <SubmitButton className="btn-secondary w-full" pendingText="Sending…">
                          Request changes
                        </SubmitButton>
                      </form>
                    </div>
                  </div>
                )}
                {m.status === "changes_requested" && m.clientNote && (
                  <div className="mt-3">
                    <Notice tone="warn">Your feedback: {m.clientNote}</Notice>
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </Card>

      {project.proposals.length > 0 && (
        <Card title="Proposals" padded={false}>
          <ul className="divide-y divide-slate-100">
            {project.proposals.map((p) => (
              <li key={p.id}>
                <Link href={`${base}/proposals/${p.id}`} className="flex items-center justify-between px-5 py-3 text-sm hover:bg-slate-50">
                  {p.title} <StatusBadge status={p.status} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {project.invoices.length > 0 && (
        <Card title="Invoices" padded={false}>
          <ul className="divide-y divide-slate-100">
            {project.invoices.map((i) => (
              <li key={i.id}>
                <Link href={`${base}/invoices/${i.id}`} className="flex items-center justify-between px-5 py-3 text-sm hover:bg-slate-50">
                  <span>
                    {i.number} · {money(i.total)}
                  </span>
                  <StatusBadge status={isOverdue(i) ? "overdue" : i.status} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
