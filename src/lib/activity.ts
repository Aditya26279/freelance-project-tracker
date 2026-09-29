import { db } from "./db";

export async function logActivity(input: {
  workspaceId: string;
  projectId?: string | null;
  actor: "freelancer" | "client" | "system";
  actorName?: string | null;
  message: string;
}) {
  await db.activity.create({
    data: {
      workspaceId: input.workspaceId,
      projectId: input.projectId ?? null,
      actor: input.actor,
      actorName: input.actorName ?? null,
      message: input.message,
    },
  });
}
