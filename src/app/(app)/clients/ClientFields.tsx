import type { Client } from "@prisma/client";
import { Field } from "@/components/ui";

export function ClientFields({ client }: { client?: Client }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Contact name *">
        <input name="name" required defaultValue={client?.name} className="input" />
      </Field>
      <Field label="Company">
        <input name="company" defaultValue={client?.company ?? ""} className="input" />
      </Field>
      <Field label="Email">
        <input name="email" type="email" defaultValue={client?.email ?? ""} className="input" />
      </Field>
      <Field label="Phone">
        <input name="phone" defaultValue={client?.phone ?? ""} className="input" />
      </Field>
      <Field label="Billing address" className="sm:col-span-2">
        <textarea name="address" rows={2} defaultValue={client?.address ?? ""} className="input" />
      </Field>
      <Field label="Private notes" className="sm:col-span-2" hint="Only visible to you.">
        <textarea name="notes" rows={3} defaultValue={client?.notes ?? ""} className="input" />
      </Field>
    </div>
  );
}
