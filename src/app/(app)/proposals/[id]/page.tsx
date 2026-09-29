import Link from "next/link";
import { db } from "@/lib/db";
import { ownedProposal } from "@/lib/scope";
import { toInputAmount } from "@/lib/money";
import { appUrl, toDateInput } from "@/lib/utils";
import {
  deleteProposal,
  duplicateProposal,
  revertProposalToDraft,
  saveProposal,
} from "@/server/proposals";
import { Card, Field, Notice, PageHeader, StatusBadge } from "@/components/ui";
import { CopyButton, SubmitButton } from "@/components/client";
import { ProposalItemsEditor } from "@/components/line-items";
import { ProposalDocument } from "@/components/documents";

export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await ownedProposal(id);
  const p = await db.proposal.findUniqueOrThrow({
    where: { id },
    include: {
      items: { orderBy: { position: "asc" } },
      client: true,
      project: { select: { id: true, name: true } },
      workspace: { select: { name: true } },
    },
  });
  const portalUrl = appUrl(`/portal/${p.client.portalToken}/proposals/${p.id}`);

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {p.title} <StatusBadge status={p.status} />
          </span>
        }
        subtitle={
          <>
            For {p.client.name} ·{" "}
            <Link href={`/projects/${p.project.id}`} className="hover:underline">
              {p.project.name}
            </Link>
          </>
        }
        back={{ href: `/projects/${p.project.id}`, label: p.project.name }}
        actions={
          p.status !== "draft" && (
            <>
              <CopyButton text={portalUrl} label="Copy client link" />
              {(p.status === "sent" || p.status === "declined") && (
                <form action={revertProposalToDraft.bind(null, id)}>
                  <SubmitButton className="btn-secondary" confirm="Pull back into draft? The client won't be able to respond until you re-send.">
                    Edit (back to draft)
                  </SubmitButton>
                </form>
              )}
              <form action={duplicateProposal.bind(null, id)}>
                <SubmitButton className="btn-secondary">Duplicate</SubmitButton>
              </form>
            </>
          )
        }
      />

      {p.status === "draft" ? (
        <form action={saveProposal.bind(null, id)} className="space-y-6">
          <Card title="Overview">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Title" className="sm:col-span-2">
                <input name="title" defaultValue={p.title} required className="input" />
              </Field>
              <Field label="Valid until">
                <input name="validUntil" type="date" defaultValue={toDateInput(p.validUntil)} className="input" />
              </Field>
              <Field label="Summary" className="sm:col-span-3" hint="The problem, your approach, and the outcome for the client.">
                <textarea name="summary" rows={5} defaultValue={p.summary ?? ""} className="input" />
              </Field>
            </div>
          </Card>
          <Card title={`Scope & pricing (${p.currency})`}>
            <ProposalItemsEditor
              currency={p.currency}
              initial={p.items.map((i) => ({
                title: i.title,
                description: i.description ?? "",
                amount: toInputAmount(i.amount),
                days: i.dueInDays?.toString() ?? "",
              }))}
            />
            <p className="mt-3 text-xs text-slate-500">
              When the client accepts, each item becomes a milestone on the project, due N days after acceptance.
            </p>
          </Card>
          <Card title="Terms">
            <textarea
              name="terms"
              rows={4}
              defaultValue={p.terms ?? ""}
              placeholder="Payment terms, revisions included, IP transfer, cancellation…"
              className="input"
            />
          </Card>
          <div className="flex flex-wrap gap-2">
            <SubmitButton className="btn-secondary">Save draft</SubmitButton>
            <SubmitButton name="intent" value="send" pendingText="Sending…" confirm="Send this proposal to the client portal?">
              Save & send to client
            </SubmitButton>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          {p.status === "sent" && (
            <Notice>
              Waiting for {p.client.name} to respond. Share the portal link or use the button above to copy it.
            </Notice>
          )}
          {p.status === "accepted" && (
            <Notice tone="success">
              Accepted. Milestones were added to{" "}
              <Link href={`/projects/${p.project.id}`} className="font-medium underline">
                {p.project.name}
              </Link>
              .
            </Notice>
          )}
          <ProposalDocument proposal={p} items={p.items} workspace={p.workspace} client={p.client} />
        </div>
      )}

      {p.status !== "accepted" && (
        <form action={deleteProposal.bind(null, id)} className="mt-8">
          <SubmitButton className="btn-ghost text-red-600" confirm="Delete this proposal?">
            Delete proposal
          </SubmitButton>
        </form>
      )}
    </>
  );
}
