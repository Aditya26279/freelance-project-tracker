import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { Card, EmptyState, PageHeader, StatusBadge } from "@/components/ui";

export const metadata = { title: "Proposals" };

export default async function ProposalsPage() {
  const { workspace } = await requireSession();
  const proposals = await db.proposal.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { createdAt: "desc" },
    include: {
      client: { select: { name: true } },
      project: { select: { name: true } },
      items: { select: { amount: true } },
    },
  });

  return (
    <>
      <PageHeader title="Proposals" subtitle="Create proposals from a project page. Accepted items become milestones." />
      <Card padded={false}>
        {proposals.length === 0 ? (
          <EmptyState
            title="No proposals yet"
            body="Open a project and click “New proposal” to send scope and pricing to your client."
            action={<Link href="/projects" className="btn-primary">Go to projects</Link>}
          />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Proposal</th>
                <th>Client</th>
                <th className="text-right">Value</th>
                <th>Sent</th>
                <th className="text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {proposals.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td>
                    <Link href={`/proposals/${p.id}`} className="link">
                      {p.title}
                    </Link>
                    <p className="text-xs text-slate-500">{p.project.name}</p>
                  </td>
                  <td className="text-slate-600">{p.client.name}</td>
                  <td className="text-right font-medium">{formatMoney(p.items.reduce((s, i) => s + i.amount, 0), p.currency)}</td>
                  <td className="text-slate-600">{formatDate(p.sentAt)}</td>
                  <td className="text-right">
                    <StatusBadge status={p.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
