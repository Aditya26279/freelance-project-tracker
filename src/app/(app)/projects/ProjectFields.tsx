import type { Client, Project } from "@prisma/client";
import { CURRENCIES, PROJECT_STATUSES, STATUS_LABELS } from "@/lib/constants";
import { toInputAmount } from "@/lib/money";
import { toDateInput } from "@/lib/utils";
import { Field } from "@/components/ui";

export function ProjectFields({
  project,
  clients,
  defaultClientId,
  defaultCurrency,
}: {
  project?: Project;
  clients?: Pick<Client, "id" | "name">[];
  defaultClientId?: string;
  defaultCurrency: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Project name *" className="sm:col-span-2">
        <input name="name" required defaultValue={project?.name} className="input" />
      </Field>
      {clients && (
        <Field label="Client *">
          <select name="clientId" required defaultValue={defaultClientId} className="input">
            <option value="">Select a client…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      {project && (
        <Field label="Status">
          <select name="status" defaultValue={project.status} className="input">
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Currency">
        <select name="currency" defaultValue={project?.currency ?? defaultCurrency} className="input">
          {CURRENCIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </Field>
      <Field label="Billing" hint="Fixed-price projects are billed by milestone; hourly by tracked time. You can mix both.">
        <select name="billingType" defaultValue={project?.billingType ?? "fixed"} className="input">
          <option value="fixed">Fixed price (milestones)</option>
          <option value="hourly">Hourly</option>
        </select>
      </Field>
      <Field label="Hourly rate">
        <input
          name="hourlyRate"
          inputMode="decimal"
          defaultValue={project ? toInputAmount(project.hourlyRate) : ""}
          placeholder="0.00"
          className="input"
        />
      </Field>
      <Field label="Budget (optional)">
        <input
          name="budget"
          inputMode="decimal"
          defaultValue={project?.budget != null ? toInputAmount(project.budget) : ""}
          placeholder="Set automatically when a proposal is accepted"
          className="input"
        />
      </Field>
      <Field label="Start date">
        <input name="startDate" type="date" defaultValue={toDateInput(project?.startDate)} className="input" />
      </Field>
      <Field label="Due date">
        <input name="dueDate" type="date" defaultValue={toDateInput(project?.dueDate)} className="input" />
      </Field>
      <Field label="Description" className="sm:col-span-2" hint="Visible to the client in their portal.">
        <textarea name="description" rows={3} defaultValue={project?.description ?? ""} className="input" />
      </Field>
    </div>
  );
}
