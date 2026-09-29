import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { db } from "./db";

/**
 * The client portal is authorised by an unguessable per-client token in the URL
 * (192 bits). Freelancers can regenerate it or disable the portal at any time.
 */
export const getPortalClient = cache(async (token: string) => {
  if (!token || token.length < 16) notFound();
  const client = await db.client.findUnique({
    where: { portalToken: token },
    include: { workspace: true },
  });
  if (!client || !client.portalEnabled) notFound();
  return client;
});
