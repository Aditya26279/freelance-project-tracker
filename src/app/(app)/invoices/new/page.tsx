import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatHours, formatMoney, minutesToHours } from "@/lib/money";
import { addDays, formatDate, toDateInput } from "@/lib/utils";
import { createInvoice } from "@/server/invoices";
import { Card, EmptyState, Field, Notice, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/client";

export const metadata = { title: "New invoice" };

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ projectId?: string }> }) {
  const { workspace } = await requireSession();
  const { projectId } = await searchParams;

  const projects = await db.project.findMany({
    where: { workspaceId: workspace.id, status: { not: "archived" } },
    select: { id: true, name: true, client: { select: { name: true } } },
    orderBy: { name: "asc" },
  });

  const project = projectId
    ? await db.project.findFirst({
        where: { id: projectId, workspaceId: workspace.id },
        include: {
          client: true,
          milestones: {
            where: { status: "approved", invoiceItem: null },
            orderBy: { position: "asc" },
          },
          timeEntries: {
            where: { billable: true, invoiceId: null, endedAt: { not: null } },
            orderBy: { startedAt: "asc" },
          },
        },
      })
    : null;

  // Step 1: pick a project
  if (!project) {
    return (
      <>
        <PageHeader title="New invoice" back={{ href: "/invoices", label: "Invoices" }} />
        <Card title="Which project are you invoicing?" className="max-w-xl" padded={false}>
          {projects.length === 0 ? (
            <EmptyState title="No projects yet" action={<Link href="/projects/new" className="btn-primary">Create project</Link>} />
          ) : (
            <ul className="divide-y divide-slate-100">
              {projects.map((p) => (
                <li key={p.id}>
                  <Link href={`/invoices/new?projectId=${p.id}`} className="block px-5 py-3 hover:bg-slate-50">
                    <p className="text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-slate-500">{p.client.name}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </>
    );
  }

  // Step 2: pick what to bill
  const money = (n: number) => formatMoney(n, project.currency);
  const unbilledMinutes = project.timeEntries.reduce((s, e) => s + e.minutes, 0);
  const nothing = project.milestones.length === 0 && project.timeEntries.length === 0;

  return (
    <>
      <PageHeader
        title="New invoice"
        subtitle={`${project.name} · ${project.client.name}`}
        back={{ href: `/projects/${project.id}`, label: project.name }}
      />
      <form action={createInvoice} className="max-w-3xl space-y-6">
        <input type="hidden" name="projectId" value={project.id} />

        {nothing && (
          <Notice tone="warn">
            No approved milestones or unbilled hours on this project. You can still bill a custom line below.
          </Notice>
        )}

        {project.milestones.length > 0 && (
          <Card title="Approved milestones" padded={false}>
            <ul className="divide-y divide-slate-100">
              {project.milestones.map((m) => (
                <li key={m.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-5 py-3 hover:bg-slate-50">
                    <input type="checkbox" name="milestoneId" value={m.id} defaultChecked className="h-4 w-4" />
                    <span className="flex-1 text-sm">
                      {m.title}
                      <span className="block text-xs text-slate-500">
                        Approved {formatDate(m.approvedAt)} by {m.approvedBy ?? "client"}
                      </span>
                    </span>
                    <span className="text-sm font-medium">{money(m.amount)}</span>
                  </label>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {project.timeEntries.length > 0 && (
          <Card
            title={`Unbilled time · ${formatHours(unbilledMinutes)}`}
            actions={
              <span className="text-xs text-slate-500">
                at {money(project.hourlyRate)}/h ≈ {money(Math.round(minutesToHours(unbilledMinutes) * project.hourlyRate))}
              </span>
            }
            padded={false}
          >
            {project.hourlyRate === 0 && (
              <div className="px-5 pt-4">
                <Notice tone="warn">
                  This project has no hourly rate. <Link href={`/projects/${project.id}/edit`} className="underline">Set one</Link> or edit the line after creating.
                </Notice>
              </div>
            )}
            <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
              {project.timeEntries.map((e) => (
                <li key={e.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-5 py-2.5 hover:bg-slate-50">
                    <input type="checkbox" name="timeEntryId" value={e.id} defaultChecked className="h-4 w-4" />
                    <span className="w-28 text-xs text-slate-500">{formatDate(e.startedAt)}</span>
                    <span className="flex-1 truncate text-sm">{e.description ?? "—"}</span>
                    <span className="text-sm">{formatHours(e.minutes)}</span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="border-t border-slate-100 px-5 py-2 text-xs text-slate-500">
              Selected entries are combined into one “Hourly work” line.
            </p>
          </Card>
        )}

        <Card title="Custom line (optional)">
          <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
            <input name="extraDescription" placeholder="e.g. Hosting setup, expenses…" className="input" />
            <input name="extraAmount" placeholder="0.00" inputMode="decimal" className="input" />
          </div>
        </Card>

        <Card title="Details">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Due date">
              <input
                name="dueDate"
                type="date"
                defaultValue={toDateInput(addDays(new Date(), workspace.paymentTerms))}
                className="input"
              />
            </Field>
            <Field label="Tax %">
              <input name="taxRate" defaultValue={workspace.defaultTaxBps / 100} inputMode="decimal" className="input" />
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <textarea name="notes" rows={2} defaultValue={workspace.invoiceFooter ?? ""} className="input" />
            </Field>
          </div>
        </Card>

        <SubmitButton pendingText="Creating…">Create draft invoice</SubmitButton>
      </form>
    </>
  );
}
