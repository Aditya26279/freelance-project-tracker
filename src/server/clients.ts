"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { ownedClient } from "@/lib/scope";
import { randomToken } from "@/lib/crypto";
import { isValidEmail, optStr, str } from "@/lib/utils";

function clientFields(fd: FormData) {
  const name = str(fd.get("name"));
  if (!name) throw new Error("Client name is required");
  const email = optStr(fd.get("email"))?.toLowerCase() ?? null;
  if (email && !isValidEmail(email)) throw new Error("Enter a valid client email");
  const cap = (v: string | null, n: number) => v?.slice(0, n) ?? null;
  return {
    name: name.slice(0, 200),
    company: cap(optStr(fd.get("company")), 200),
    email,
    phone: cap(optStr(fd.get("phone")), 50),
    address: cap(optStr(fd.get("address")), 1000),
    notes: cap(optStr(fd.get("notes")), 10_000),
  };
}

export async function createClient(fd: FormData) {
  const { workspace } = await requireSession();
  const client = await db.client.create({
    data: { ...clientFields(fd), workspaceId: workspace.id, portalToken: randomToken(24) },
  });
  redirect(`/clients/${client.id}`);
}

export async function updateClient(id: string, fd: FormData) {
  await ownedClient(id);
  await db.client.update({ where: { id }, data: clientFields(fd) });
  revalidatePath(`/clients/${id}`);
}

export async function regeneratePortalLink(id: string) {
  await ownedClient(id);
  await db.client.update({ where: { id }, data: { portalToken: randomToken(24) } });
  revalidatePath(`/clients/${id}`);
}

export async function togglePortal(id: string) {
  const client = await ownedClient(id);
  await db.client.update({ where: { id }, data: { portalEnabled: !client.portalEnabled } });
  revalidatePath(`/clients/${id}`);
}

export async function deleteClient(id: string) {
  await ownedClient(id);
  // Issued invoices are financial records; don't let a client delete cascade them away.
  const issued = await db.invoice.count({ where: { clientId: id, status: { in: ["sent", "paid"] } } });
  if (issued > 0) {
    throw new Error("This client has sent or paid invoices. Disable their portal instead of deleting.");
  }
  await db.client.delete({ where: { id } });
  redirect("/clients");
}
