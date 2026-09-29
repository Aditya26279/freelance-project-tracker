"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { ownedProject, ownedProposal } from "@/lib/scope";
import { parseAmount } from "@/lib/money";
import { optStr, parseDateInput, str } from "@/lib/utils";
import { logActivity } from "@/lib/activity";

export async function createProposal(projectId: string) {
  const { workspace } = await requireSession();
  const project = await ownedProject(projectId);
  const proposal = await db.proposal.create({
    data: {
      workspaceId: workspace.id,
      projectId,
      clientId: project.clientId,
      title: `Proposal: ${project.name}`,
      currency: project.currency,
      items: { create: [{ title: "Discovery & planning", amount: 0, position: 0 }] },
    },
  });
  redirect(`/proposals/${proposal.id}`);
}

/** Items arrive as parallel arrays from the LineItemsEditor. */
function parseProposalItems(fd: FormData) {
  const titles = fd.getAll("item_title").map(String);
  const descs = fd.getAll("item_description").map(String);
  const amounts = fd.getAll("item_amount").map(String);
  const days = fd.getAll("item_days").map(String);
  return titles
    .map((title, i) => {
      const d = days[i]?.trim() ? Number(days[i]) : null;
      if (d != null && (!Number.isInteger(d) || d < 0 || d > 3650)) {
        throw new Error(`Due days for "${title.trim()}" must be a whole number between 0 and 3650`);
      }
      return {
        title: title.trim().slice(0, 200),
        description: descs[i]?.trim().slice(0, 5000) || null,
        amount: parseAmount(amounts[i]),
        dueInDays: d,
        position: i,
      };
    })
    .filter((it) => it.title !== "")
    .map((it) => {
      if (Number.isNaN(it.amount)) throw new Error(`Invalid amount for "${it.title}" (must be 0 or more)`);
      return it;
    });
}

export async function saveProposal(id: string, fd: FormData) {
  const p = await ownedProposal(id);
  if (p.status !== "draft") throw new Error("Only drafts can be edited");
  const items = parseProposalItems(fd);
  await db.$transaction([
    db.proposalItem.deleteMany({ where: { proposalId: id } }),
    db.proposal.update({
      where: { id },
      data: {
        title: str(fd.get("title")).slice(0, 200) || p.title,
        summary: optStr(fd.get("summary"))?.slice(0, 20_000) ?? null,
        terms: optStr(fd.get("terms"))?.slice(0, 20_000) ?? null,
        validUntil: parseDateInput(fd.get("validUntil")),
        items: { create: items },
      },
    }),
  ]);
  if (fd.get("intent") === "send") return sendProposal(id);
  revalidatePath(`/proposals/${id}`);
}

export async function sendProposal(id: string) {
  const { user } = await requireSession();
  const p = await ownedProposal(id);
  const count = await db.proposalItem.count({ where: { proposalId: id } });
  if (count === 0) throw new Error("Add at least one line item before sending");
  const res = await db.proposal.updateMany({ where: { id, status: "draft" }, data: { status: "sent", sentAt: new Date() } });
  if (res.count === 0) return;
  await logActivity({
    workspaceId: p.workspaceId,
    projectId: p.projectId,
    actor: "freelancer",
    actorName: user.name,
    message: `Sent proposal "${p.title}" to client`,
  });
  revalidatePath(`/proposals/${id}`);
}

export async function revertProposalToDraft(id: string) {
  const p = await ownedProposal(id);
  if (p.status !== "sent" && p.status !== "declined") return;
  // Conditional so a pull-back can't race with the client accepting.
  await db.proposal.updateMany({
    where: { id, status: { in: ["sent", "declined"] } },
    data: { status: "draft", sentAt: null, respondedAt: null, respondedByName: null, responseNote: null },
  });
  revalidatePath(`/proposals/${id}`);
}

export async function duplicateProposal(id: string) {
  const p = await ownedProposal(id);
  const items = await db.proposalItem.findMany({ where: { proposalId: id }, orderBy: { position: "asc" } });
  const copy = await db.proposal.create({
    data: {
      workspaceId: p.workspaceId,
      projectId: p.projectId,
      clientId: p.clientId,
      title: `${p.title} (revised)`,
      summary: p.summary,
      terms: p.terms,
      currency: p.currency,
      items: {
        create: items.map(({ title, description, amount, dueInDays, position }) => ({
          title,
          description,
          amount,
          dueInDays,
          position,
        })),
      },
    },
  });
  redirect(`/proposals/${copy.id}`);
}

export async function deleteProposal(id: string) {
  const p = await ownedProposal(id);
  if (p.status === "accepted") throw new Error("Accepted proposals cannot be deleted");
  await db.proposal.delete({ where: { id } });
  redirect("/proposals");
}
