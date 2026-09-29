import Link from "next/link";
import { db } from "@/lib/db";
import { ownedClient } from "@/lib/scope";
import { formatMoney } from "@/lib/money";
import { appUrl, formatDate, isOverdue } from "@/lib/utils";
import { deleteClient, regeneratePortalLink, togglePortal, updateClient } from "@/server/clients";
import { Card, EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { CopyButton, SubmitButton } from "@/components/client";
import { ClientFields } from "../ClientFields";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await ownedClient(id);
  const [projects, invoices] = await Promise.all([
    db.project.findMany({ where: { clientId: id }, orderBy: { createdAt: "desc" } }),
    db.invoice.findMany({ where: { clientId: id }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  const portalUrl = appUrl(`/portal/${client.portalToken}`);

  return (
    <>
      <PageHeader
        title={client.name}
        subtitle={client.company}
        back={{ href: "/clients", label: "Clients" }}
        actions={
          <Link href={`/projects/new?clientId=${client.id}`} className="btn-primary">
            New project
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Projects" padded={false}>
            {projects.length === 0 ? (
              <EmptyState title="No projects for this client yet" />
            ) : (
              <table className="table">
                <tbody>
                  {projects.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <Link href={`/projects/${p.id}`} className="link">
                          {p.name}
                        </Link>
                      </td>
                      <td className="text-slate-500">{p.billingType === "hourly" ? "Hourly" : "Fixed price"}</td>
                      <td className="text-right">
                        <StatusBadge status={p.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card title="Invoices" padded={false}>
            {invoices.length === 0 ? (
              <EmptyState title="No invoices yet" />
            ) : (
              <table className="table">
                <tbody>
                  {invoices.map((i) => (
                    <tr key={i.id}>
                      <td>
                        <Link href={`/invoices/${i.id}`} className="link">
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
            )}
          </Card>

          <Card title="Details">
            <form action={updateClient.bind(null, client.id)} className="space-y-5">
              <ClientFields client={client} />
              <SubmitButton>Save changes</SubmitButton>
            </form>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Client portal">
            <p className="text-sm text-slate-600">
              Share this private link. Your client can review proposals, approve milestones and pay invoices. No login needed.
            </p>
            {client.portalEnabled ? (
              <>
                <div className="mt-3 break-all rounded-lg bg-slate-50 p-3 font-mono text-xs text-slate-700">{portalUrl}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <CopyButton text={portalUrl} label="Copy link" />
                  <a href={portalUrl} target="_blank" className="btn-secondary btn-sm">
                    Open ↗
                  </a>
                </div>
              </>
            ) : (
              <p className="mt-3 text-sm font-medium text-amber-700">Portal is disabled. The link won&apos;t work.</p>
            )}
            <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              <form action={regeneratePortalLink.bind(null, client.id)}>
                <SubmitButton className="btn-ghost btn-sm" confirm="The old link will stop working. Continue?">
                  Regenerate link
                </SubmitButton>
              </form>
              <form action={togglePortal.bind(null, client.id)}>
                <SubmitButton className="btn-ghost btn-sm">{client.portalEnabled ? "Disable portal" : "Enable portal"}</SubmitButton>
              </form>
            </div>
          </Card>

          <Card title="Danger zone">
            <form action={deleteClient.bind(null, client.id)}>
              <SubmitButton className="btn-danger" confirm="Delete this client and ALL their projects, proposals and invoices?">
                Delete client
              </SubmitButton>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
