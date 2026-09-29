"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { ownedClient, ownedMilestone, ownedProject } from "@/lib/scope";
import { CURRENCIES, PROJECT_STATUSES } from "@/lib/constants";
import { parseAmount } from "@/lib/money";
import { optStr, parseDateInput, str } from "@/lib/utils";
import { logActivity } from "@/lib/activity";

function projectFields(fd: FormData) {
  const name = str(fd.get("name"));
  if (!name) throw new Error("Project name is required");
  const currency = str(fd.get("currency"));
  if (!(CURRENCIES as readonly string[]).includes(currency)) throw new Error("Invalid currency");
  const billingType = str(fd.get("billingType")) === "hourly" ? "hourly" : "fixed";
  const rate = parseAmount(str(fd.get("hourlyRate")));
  if (Number.isNaN(rate)) throw new Error("Hourly rate must be a positive amount");
  const budgetRaw = str(fd.get("budget"));
  const budget = budgetRaw ? parseAmount(budgetRaw) : null;
  if (budget != null && Number.isNaN(budget)) throw new Error("Budget must be a positive amount");
  return {
    name: name.slice(0, 200),
    description: optStr(fd.get("description"))?.slice(0, 10_000) ?? null,
    currency,
    billingType,
    hourlyRate: rate,
    budget,
    startDate: parseDateInput(fd.get("startDate")),
    dueDate: parseDateInput(fd.get("dueDate")),
  };
}

export async function createProject(fd: FormData) {
  const { workspace, user } = await requireSession();
  const client = await ownedClient(str(fd.get("clientId")));
  const project = await db.project.create({
    data: { ...projectFields(fd), workspaceId: workspace.id, clientId: client.id },
  });
  await logActivity({
    workspaceId: workspace.id,
    projectId: project.id,
    actor: "freelancer",
    actorName: user.name,
    message: `Project "${project.name}" created`,
  });
  redirect(`/projects/${project.id}`);
}

export async function updateProject(id: string, fd: FormData) {
  const current = await ownedProject(id);
  const status = str(fd.get("status"));
  const fields = projectFields(fd);
  // Changing currency after money has been attached would silently re-denominate
  // milestone amounts and rates, so lock it once there are proposals or invoices.
  if (fields.currency !== current.currency) {
    const [proposals, invoices] = await Promise.all([
      db.proposal.count({ where: { projectId: id } }),
      db.invoice.count({ where: { projectId: id } }),
    ]);
    if (proposals + invoices > 0) {
      throw new Error("Currency cannot be changed once the project has proposals or invoices");
    }
  }
  await db.project.update({
    where: { id },
    data: {
      ...fields,
      ...((PROJECT_STATUSES as readonly string[]).includes(status) ? { status } : {}),
    },
  });
  redirect(`/projects/${id}`);
}

export async function deleteProject(id: string) {
  await ownedProject(id);
  await db.project.delete({ where: { id } });
  redirect("/projects");
}

// ------------------------------------------------------------ Milestones

export async function addMilestone(projectId: string, fd: FormData) {
  await ownedProject(projectId);
  const title = str(fd.get("title"));
  if (!title) throw new Error("Title is required");
  const amount = parseAmount(str(fd.get("amount")));
  if (Number.isNaN(amount)) throw new Error("Amount must be a positive number");
  const count = await db.milestone.count({ where: { projectId } });
  await db.milestone.create({
    data: {
      projectId,
      title: title.slice(0, 200),
      description: optStr(fd.get("description"))?.slice(0, 10_000) ?? null,
      amount,
      dueDate: parseDateInput(fd.get("dueDate")),
      position: count,
    },
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function updateMilestone(id: string, fd: FormData) {
  const m = await ownedMilestone(id);
  if (m.status === "approved") throw new Error("Approved milestones are locked");
  const title = str(fd.get("title"));
  const amount = parseAmount(str(fd.get("amount")));
  if (Number.isNaN(amount)) throw new Error("Amount must be a positive number");
  await db.milestone.update({
    where: { id },
    data: {
      title: title.slice(0, 200) || m.title,
      description: optStr(fd.get("description"))?.slice(0, 10_000) ?? null,
      amount,
      dueDate: parseDateInput(fd.get("dueDate")),
    },
  });
  revalidatePath(`/projects/${m.projectId}`);
}

export async function deleteMilestone(id: string) {
  const m = await ownedMilestone(id);
  if (m.status === "approved") throw new Error("Approved milestones cannot be deleted");
  await db.milestone.delete({ where: { id } });
  revalidatePath(`/projects/${m.projectId}`);
}

export async function startMilestone(id: string) {
  const m = await ownedMilestone(id);
  if (m.status !== "pending") return;
  await db.milestone.update({ where: { id }, data: { status: "in_progress" } });
  revalidatePath(`/projects/${m.projectId}`);
}

/** Freelancer submits work for client approval. */
export async function submitMilestone(id: string, fd: FormData) {
  const { user } = await requireSession();
  const m = await ownedMilestone(id);
  if (!["pending", "in_progress", "changes_requested"].includes(m.status)) return;
  const res = await db.milestone.updateMany({
    where: { id, status: { in: ["pending", "in_progress", "changes_requested"] } },
    data: {
      status: "submitted",
      submittedAt: new Date(),
      deliverable: optStr(fd.get("deliverable"))?.slice(0, 5000) ?? null,
      clientNote: null,
    },
  });
  if (res.count === 0) return;
  await logActivity({
    workspaceId: m.project.workspaceId,
    projectId: m.projectId,
    actor: "freelancer",
    actorName: user.name,
    message: `Submitted milestone "${m.title}" for approval`,
  });
  revalidatePath(`/projects/${m.projectId}`);
}

export async function withdrawMilestone(id: string) {
  const m = await ownedMilestone(id);
  if (m.status !== "submitted") return;
  await db.milestone.updateMany({ where: { id, status: "submitted" }, data: { status: "in_progress", submittedAt: null } });
  revalidatePath(`/projects/${m.projectId}`);
}
