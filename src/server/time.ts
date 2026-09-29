"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { ownedProject, ownedTimeEntry } from "@/lib/scope";
import { optStr, str } from "@/lib/utils";
import { parseDuration } from "@/lib/money";

function refresh() {
  revalidatePath("/", "layout");
}

async function stopRunning(userId: string) {
  const running = await db.timeEntry.findFirst({ where: { userId, endedAt: null } });
  if (!running) return;
  const endedAt = new Date();
  const minutes = Math.max(1, Math.round((endedAt.getTime() - running.startedAt.getTime()) / 60000));
  await db.timeEntry.update({ where: { id: running.id }, data: { endedAt, minutes } });
}

export async function startTimer(fd: FormData) {
  const { user } = await requireSession();
  const project = await ownedProject(str(fd.get("projectId")));
  const milestoneId = optStr(fd.get("milestoneId"));
  if (milestoneId) {
    const ok = await db.milestone.count({ where: { id: milestoneId, projectId: project.id } });
    if (!ok) throw new Error("Milestone does not belong to project");
  }
  await stopRunning(user.id); // only one timer at a time
  await db.timeEntry.create({
    data: {
      projectId: project.id,
      milestoneId,
      userId: user.id,
      description: optStr(fd.get("description"))?.slice(0, 1000) ?? null,
      startedAt: new Date(),
      billable: fd.get("billable") !== "off",
    },
  });
  refresh();
}

export async function stopTimer() {
  const { user } = await requireSession();
  await stopRunning(user.id);
  refresh();
}

/** Manual entry: date + duration as "1.5" hours or "1:30". */
export async function addTimeEntry(fd: FormData) {
  const { user } = await requireSession();
  const project = await ownedProject(str(fd.get("projectId")));
  const minutes = parseDuration(str(fd.get("duration")));
  if (Number.isNaN(minutes)) throw new Error("Enter a duration between 1 minute and 24 hours, like 1.5 or 1:30");
  const dateStr = str(fd.get("date"));
  if (dateStr && !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) throw new Error("Invalid date");
  // Midday UTC keeps the entry on the chosen calendar day in every timezone.
  const startedAt = dateStr ? new Date(`${dateStr}T12:00:00Z`) : new Date();
  if (isNaN(startedAt.getTime())) throw new Error("Invalid date");
  const milestoneId = optStr(fd.get("milestoneId"));
  if (milestoneId) {
    const ok = await db.milestone.count({ where: { id: milestoneId, projectId: project.id } });
    if (!ok) throw new Error("Milestone does not belong to project");
  }
  await db.timeEntry.create({
    data: {
      projectId: project.id,
      milestoneId,
      userId: user.id,
      description: optStr(fd.get("description"))?.slice(0, 1000) ?? null,
      startedAt,
      endedAt: new Date(startedAt.getTime() + minutes * 60000),
      minutes,
      billable: fd.get("billable") === "on",
    },
  });
  refresh();
}

export async function toggleBillable(id: string) {
  const e = await ownedTimeEntry(id);
  if (e.invoiceId) throw new Error("Invoiced entries are locked");
  await db.timeEntry.update({ where: { id }, data: { billable: !e.billable } });
  refresh();
}

export async function deleteTimeEntry(id: string) {
  const e = await ownedTimeEntry(id);
  if (e.invoiceId) throw new Error("Invoiced entries cannot be deleted");
  await db.timeEntry.delete({ where: { id } });
  refresh();
}
