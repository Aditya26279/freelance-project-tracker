import Link from "next/link";
import { db } from "@/lib/db";
import { ownedProject } from "@/lib/scope";
import { formatHours, formatMoney, toInputAmount } from "@/lib/money";
import { appUrl, formatDate, formatDateTime, isOverdue, timeAgo, toDateInput } from "@/lib/utils";
import {
  addMilestone,
  deleteMilestone,
  startMilestone,
  submitMilestone,
  updateMilestone,
  withdrawMilestone,
} from "@/server/projects";
import { createProposal } from "@/server/proposals";
import { deleteTimeEntry, toggleBillable } from "@/server/time";
import { Card, EmptyState, Field, Notice, PageHeader, Stat, StatusBadge } from "@/components/ui";
import { CopyButton, SubmitButton } from "@/components/client";
import { ManualTimeForm, StartTimerForm } from "@/components/time-forms";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const base = await ownedProject(id);
  const project = await db.project.findUniqueOrThrow({
    where: { id: base.id },
    include: {
      client: true,
      milestones: { orderBy: { position: "asc" }, include: { invoiceItem: { include: { invoice: true } } } },
      proposals: { orderBy: { createdAt: "desc" } },
      invoices: { orderBy: { createdAt: "desc" } },
      timeEntries: { orderBy: { startedAt: "desc" }, take: 15, include: { milestone: { select: { title: true } } } },
      activities: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
  const timeAgg = await db.timeEntry.groupBy({
    by: ["billable"],
    where: { projectId: id, endedAt: { not: null } },
    _sum: { minutes: true },
  });
  const unbilledAgg = await db.timeEntry.aggregate({
    where: { projectId: id, billable: true, invoiceId: null, endedAt: { not: null } },
    _sum: { minutes: true },
  });
  const totalMinutes = timeAgg.reduce((s, r) => s + (r._sum.minutes ?? 0), 0);
  const unbilledMinutes = unbilledAgg._sum.minutes ?? 0;
  const invoiced = project.invoices.filter((i) => i.status !== "void" && i.status !== "draft").reduce((s, i) => s + i.total, 0);
  const paid = project.invoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.total, 0);
  const money = (n: number) => formatMoney(n, project.currency);
  const portalUrl = appUrl(`/portal/${project.client.portalToken}/projects/${project.id}`);
  const openMilestones = project.milestones.filter((m) => m.status !== "approved").map((m) => ({ id: m.id, title: m.title }));
  const projectOpt = [{ id: project.id, name: project.name, milestones: openMilestones }];
  const readyToInvoice = project.milestones.some((m) => m.status === "approved" && !m.invoiceItem && m.amount > 0);

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {project.name} <StatusBadge status={project.status} />
          </span>
        }
        subtitle={
          <>
            <Link href={`/clients/${project.clientId}`} className="hover:underline">
              {project.client.name}
            </Link>
            {project.dueDate && <> · due {formatDate(project.dueDate)}</>}
            {project.billingType === "hourly" && <> · {money(project.hourlyRate)}/h</>}
          </>
        }
        back={{ href: "/projects", label: "Projects" }}
        actions={
          <>
            <CopyButton text={portalUrl} label="Copy client link" className="btn-sm" />
            <Link href={`/projects/${id}/edit`} className="btn-secondary">
              Edit
            </Link>
            <form action={createProposal.bind(null, id)}>
              <SubmitButton className="btn-secondary" pendingText="Creating…">
                New proposal
              </SubmitButton>
            </form>
            <Link href={`/invoices/new?projectId=${id}`} className="btn-primary">
              Create invoice
            </Link>
          </>
        }
      />

      {readyToInvoice && (
        <div className="mb-6">
          <Notice tone="success">
            Some milestones are approved and not invoiced yet.{" "}
            <Link href={`/invoices/new?projectId=${id}`} className="font-medium underline">
              Create an invoice →
            </Link>
          </Notice>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Budget" value={project.budget != null ? money(project.budget) : "—"} />
        <Stat label="Invoiced" value={money(invoiced)} hint={`${money(paid)} paid`} />
        <Stat label="Time logged" value={formatHours(totalMinutes)} />
        <Stat
          label="Unbilled time"
          value={formatHours(unbilledMinutes)}
          hint={project.hourlyRate ? `≈ ${money(Math.round((unbilledMinutes / 60) * project.hourlyRate))}` : undefined}
        />
      </div>

      {project.description && <p className="mt-6 whitespace-pre-line text-sm text-slate-600">{project.description}</p>}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* ---------------------------------------------------------- Milestones */}
          <Card title="Milestones & approvals" padded={false}>
            {project.milestones.length === 0 ? (
              <EmptyState
                title="No milestones yet"
                body="Add milestones below, or send a proposal. Accepted proposal items become milestones automatically."
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {project.milestones.map((m) => (
                  <li key={m.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">{m.title}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {m.amount > 0 && <>{money(m.amount)} · </>}
                          {m.dueDate ? `Due ${formatDate(m.dueDate)}` : "No due date"}
                          {m.approvedAt && ` · Approved by ${m.approvedBy ?? "client"} on ${formatDate(m.approvedAt)}`}
                        </p>
                        {m.description && <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{m.description}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        {m.invoiceItem && (
                          <Link href={`/invoices/${m.invoiceItem.invoiceId}`}>
                            <StatusBadge
                              status={m.invoiceItem.invoice.status === "paid" ? "paid" : "sent"}
                              label={`${m.invoiceItem.invoice.number}${m.invoiceItem.invoice.status === "paid" ? " · paid" : ""}`}
                            />
                          </Link>
                        )}
                        <StatusBadge status={m.status} />
                      </div>
                    </div>

                    {m.status === "changes_requested" && m.clientNote && (
                      <div className="mt-3">
                        <Notice tone="warn">
                          <strong>Client feedback:</strong> {m.clientNote}
                        </Notice>
                      </div>
                    )}
                    {m.status === "submitted" && (
                      <p className="mt-2 text-xs text-amber-700">
                        Submitted {m.submittedAt ? timeAgo(m.submittedAt) : ""}, waiting for the client to approve in their portal.
                      </p>
                    )}
                    {m.deliverable && m.status !== "pending" && (
                      <p className="mt-2 whitespace-pre-line text-xs text-slate-500">Deliverable: {m.deliverable}</p>
                    )}

                    {m.status !== "approved" && (
                      <div className="mt-3 flex flex-wrap items-start gap-2">
                        {m.status === "pending" && (
                          <form action={startMilestone.bind(null, m.id)}>
                            <SubmitButton className="btn-secondary btn-sm">Start work</SubmitButton>
                          </form>
                        )}
                        {["pending", "in_progress", "changes_requested"].includes(m.status) && (
                          <details className="group">
                            <summary className="btn-primary btn-sm list-none">Submit for approval</summary>
                            <form action={submitMilestone.bind(null, m.id)} className="mt-2 w-full max-w-md space-y-2 sm:w-96">
                              <textarea
                                name="deliverable"
                                rows={3}
                                className="input"
                                placeholder="Link to the deliverable and a short note for the client…"
                                defaultValue={m.deliverable ?? ""}
                              />
                              <SubmitButton className="btn-primary btn-sm">Send to client</SubmitButton>
                            </form>
                          </details>
                        )}
                        {m.status === "submitted" && (
                          <form action={withdrawMilestone.bind(null, m.id)}>
                            <SubmitButton className="btn-ghost btn-sm">Withdraw submission</SubmitButton>
                          </form>
                        )}
                        <details>
                          <summary className="btn-ghost btn-sm list-none">Edit</summary>
                          <form action={updateMilestone.bind(null, m.id)} className="mt-2 grid w-full gap-2 sm:w-[28rem] sm:grid-cols-2">
                            <input name="title" defaultValue={m.title} className="input sm:col-span-2" />
                            <input name="amount" defaultValue={toInputAmount(m.amount)} className="input" inputMode="decimal" />
                            <input name="dueDate" type="date" defaultValue={toDateInput(m.dueDate)} className="input" />
                            <textarea name="description" defaultValue={m.description ?? ""} rows={2} className="input sm:col-span-2" />
                            <div className="flex gap-2 sm:col-span-2">
                              <SubmitButton className="btn-primary btn-sm">Save</SubmitButton>
                            </div>
                          </form>
                        </details>
                        <form action={deleteMilestone.bind(null, m.id)}>
                          <SubmitButton className="btn-ghost btn-sm text-red-600" confirm="Delete this milestone?">
                            Delete
                          </SubmitButton>
                        </form>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <details className="border-t border-slate-100 px-5 py-4">
              <summary className="cursor-pointer text-sm font-medium text-brand-600">+ Add milestone</summary>
              <form action={addMilestone.bind(null, id)} className="mt-3 grid gap-3 sm:grid-cols-4">
                <Field label="Title" className="sm:col-span-2">
                  <input name="title" required className="input" />
                </Field>
                <Field label={`Amount (${project.currency})`}>
                  <input name="amount" inputMode="decimal" placeholder="0.00" className="input" />
                </Field>
                <Field label="Due">
                  <input name="dueDate" type="date" className="input" />
                </Field>
                <Field label="Description" className="sm:col-span-4">
                  <textarea name="description" rows={2} className="input" />
                </Field>
                <div>
                  <SubmitButton>Add milestone</SubmitButton>
                </div>
              </form>
            </details>
          </Card>

          {/* ---------------------------------------------------------- Time */}
          <Card title="Time tracking" actions={<Link href={`/time?projectId=${id}`} className="link text-xs">All entries →</Link>}>
            <div className="space-y-3">
              <StartTimerForm projects={projectOpt} projectId={id} />
              <details>
                <summary className="cursor-pointer text-sm text-slate-600">Log time manually</summary>
                <div className="mt-3">
                  <ManualTimeForm projects={projectOpt} projectId={id} />
                </div>
              </details>
            </div>
            {project.timeEntries.length > 0 && (
              <table className="table mt-4">
                <tbody>
                  {project.timeEntries.map((e) => (
                    <tr key={e.id}>
                      <td className="whitespace-nowrap text-slate-500">{formatDateTime(e.startedAt)}</td>
                      <td>
                        {e.description ?? <span className="text-slate-400">No description</span>}
                        {e.milestone && <span className="text-xs text-slate-500"> · {e.milestone.title}</span>}
                      </td>
                      <td className="whitespace-nowrap font-medium">{e.endedAt ? formatHours(e.minutes) : <StatusBadge status="in_progress" label="Running" />}</td>
                      <td className="whitespace-nowrap text-right">
                        {e.invoiceId ? (
                          <Link href={`/invoices/${e.invoiceId}`} className="text-xs text-slate-500 hover:underline">
                            Invoiced
                          </Link>
                        ) : (
                          <span className="inline-flex gap-1">
                            <form action={toggleBillable.bind(null, e.id)}>
                              <button className="btn-ghost btn-sm">{e.billable ? "Billable" : "Non-billable"}</button>
                            </form>
                            <form action={deleteTimeEntry.bind(null, e.id)}>
                              <button className="btn-ghost btn-sm text-red-600">✕</button>
                            </form>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Proposals" padded={false}>
            {project.proposals.length === 0 ? (
              <EmptyState title="No proposals" body="Send scope & pricing for the client to accept." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {project.proposals.map((p) => (
                  <li key={p.id}>
                    <Link href={`/proposals/${p.id}`} className="flex items-center justify-between gap-2 px-5 py-3 text-sm hover:bg-slate-50">
                      <span className="truncate">{p.title}</span>
                      <StatusBadge status={p.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Invoices" padded={false}>
            {project.invoices.length === 0 ? (
              <EmptyState title="No invoices" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {project.invoices.map((i) => (
                  <li key={i.id}>
                    <Link href={`/invoices/${i.id}`} className="flex items-center justify-between gap-2 px-5 py-3 text-sm hover:bg-slate-50">
                      <span>
                        {i.number} · {money(i.total)}
                      </span>
                      <StatusBadge status={isOverdue(i) ? "overdue" : i.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Activity" padded={false}>
            {project.activities.length === 0 ? (
              <EmptyState title="No activity yet" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {project.activities.map((a) => (
                  <li key={a.id} className="px-5 py-3 text-sm">
                    <p>
                      {a.actor === "client" && <span className="font-medium text-amber-700">{a.actorName ?? "Client"}: </span>}
                      {a.message}
                    </p>
                    <p className="text-xs text-slate-500">{timeAgo(a.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
