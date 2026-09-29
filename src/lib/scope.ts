import "server-only";
import { notFound } from "next/navigation";
import { db } from "./db";
import { requireSession } from "./auth";

/**
 * Tenant-scoped lookups. Every record is fetched through the caller's workspace so a
 * guessed ID from another workspace 404s instead of leaking.
 */

export async function ownedClient(id: string) {
  const { workspace } = await requireSession();
  const client = await db.client.findFirst({ where: { id, workspaceId: workspace.id } });
  if (!client) notFound();
  return client;
}

export async function ownedProject(id: string) {
  const { workspace } = await requireSession();
  const project = await db.project.findFirst({ where: { id, workspaceId: workspace.id } });
  if (!project) notFound();
  return project;
}

export async function ownedMilestone(id: string) {
  const { workspace } = await requireSession();
  const m = await db.milestone.findFirst({
    where: { id, project: { workspaceId: workspace.id } },
    include: { project: true },
  });
  if (!m) notFound();
  return m;
}

export async function ownedProposal(id: string) {
  const { workspace } = await requireSession();
  const p = await db.proposal.findFirst({ where: { id, workspaceId: workspace.id } });
  if (!p) notFound();
  return p;
}

export async function ownedInvoice(id: string) {
  const { workspace } = await requireSession();
  const inv = await db.invoice.findFirst({ where: { id, workspaceId: workspace.id } });
  if (!inv) notFound();
  return inv;
}

export async function ownedTimeEntry(id: string) {
  const { user, workspace } = await requireSession();
  const e = await db.timeEntry.findFirst({
    where: { id, userId: user.id, project: { workspaceId: workspace.id } },
  });
  if (!e) notFound();
  return e;
}
