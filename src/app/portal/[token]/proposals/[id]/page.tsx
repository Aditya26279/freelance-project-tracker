import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getPortalClient } from "@/lib/portal";
import { startOfTodayUTC } from "@/lib/utils";
import { acceptProposal, declineProposal } from "@/server/portal";
import { Card, Notice } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { ProposalDocument } from "@/components/documents";

export default async function PortalProposal({ params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const client = await getPortalClient(token);
  const proposal = await db.proposal.findFirst({
    where: { id, clientId: client.id, status: { not: "draft" } },
    include: { items: { orderBy: { position: "asc" } }, project: { select: { id: true } } },
  });
  if (!proposal) notFound();
  const expired = !!proposal.validUntil && proposal.validUntil.getTime() < startOfTodayUTC().getTime();

  return (
    <div className="space-y-6">
      <Link href={`/portal/${token}`} className="text-sm text-slate-500 hover:text-slate-700">
        ← Back
      </Link>
      <ProposalDocument proposal={proposal} items={proposal.items} workspace={client.workspace} client={client} />

      {proposal.status === "sent" && expired && (
        <Notice tone="warn">This proposal has expired. Please contact {client.workspace.name} for an updated version.</Notice>
      )}

      {proposal.status === "sent" && !expired && (
        <Card title="Your response">
          <div className="grid gap-6 sm:grid-cols-2">
            <form action={acceptProposal.bind(null, token, id)} className="space-y-3">
              <label className="block">
                <span className="label">Full name (acts as your signature)</span>
                <input name="signerName" required defaultValue={client.name} className="input" />
              </label>
              <input name="note" placeholder="Optional message" className="input" />
              <label className="flex items-start gap-2 text-sm text-slate-600">
                <input type="checkbox" name="agree" required className="mt-0.5" />
                I agree to the scope, pricing and terms in this proposal.
              </label>
              <SubmitButton className="btn-success w-full" pendingText="Accepting…">
                Accept proposal
              </SubmitButton>
            </form>
            <form action={declineProposal.bind(null, token, id)} className="space-y-3 border-t border-slate-100 pt-6 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
              <input type="hidden" name="signerName" value={client.name} />
              <label className="block">
                <span className="label">Not quite right?</span>
                <textarea name="note" rows={4} placeholder="Let us know what you'd like changed…" className="input" />
              </label>
              <SubmitButton className="btn-secondary w-full" confirm="Decline this proposal?" pendingText="Sending…">
                Decline
              </SubmitButton>
            </form>
          </div>
        </Card>
      )}

      {proposal.status === "accepted" && (
        <Notice tone="success">
          Thanks! This proposal is accepted.{" "}
          <Link href={`/portal/${token}/projects/${proposal.project.id}`} className="font-medium underline">
            Track progress →
          </Link>
        </Notice>
      )}
    </div>
  );
}
