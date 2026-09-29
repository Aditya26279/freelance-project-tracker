import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "Clients" };

export default async function ClientsPage() {
  const { workspace } = await requireSession();
  const clients = await db.client.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { name: "asc" },
    include: {
      _count: { select: { projects: true } },
      invoices: { where: { status: "sent" }, select: { id: true } },
    },
  });

  return (
    <>
      <PageHeader title="Clients" actions={<Link href="/clients/new" className="btn-primary">Add client</Link>} />
      <Card padded={false}>
        {clients.length === 0 ? (
          <EmptyState
            title="No clients yet"
            body="Each client gets a private portal for proposals, approvals and payments."
            action={<Link href="/clients/new" className="btn-primary">Add your first client</Link>}
          />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Projects</th>
                <th>Unpaid invoices</th>
                <th>Portal</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td>
                    <Link href={`/clients/${c.id}`} className="link">
                      {c.name}
                    </Link>
                    {c.company && <p className="text-xs text-slate-500">{c.company}</p>}
                  </td>
                  <td className="text-slate-600">{c.email ?? "—"}</td>
                  <td>{c._count.projects}</td>
                  <td>{c.invoices.length || "—"}</td>
                  <td className="text-xs">{c.portalEnabled ? "Enabled" : <span className="text-slate-400">Disabled</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
