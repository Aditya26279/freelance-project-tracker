"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getPortalClient } from "@/lib/portal";
import { addDays, optStr, startOfTodayUTC, str } from "@/lib/utils";
import { logActivity } from "@/lib/activity";
import {
  createRazorpayOrder,
  createStripeCheckout,
  fetchRazorpayPayment,
  paymentConfig,
  settleRazorpayPayment,
  verifyRazorpayPaymentSignature,
} from "@/lib/payments";

function signer(fd: FormData, fallback: string) {
  return (str(fd.get("signerName")) || fallback).slice(0, 120);
}

async function portalProposal(token: string, id: string) {
  const client = await getPortalClient(token);
  const p = await db.proposal.findFirst({
    where: { id, clientId: client.id, status: "sent" },
    include: { items: { orderBy: { position: "asc" } } },
  });
  if (!p) throw new Error("Proposal not found or already answered");
  return { client, p };
}

/** Accepting a proposal turns its line items into project milestones. */
export async function acceptProposal(token: string, id: string, fd: FormData) {
  const { client, p } = await portalProposal(token, id);
  if (fd.get("agree") !== "on") throw new Error("Please confirm you agree to the proposal");
  if (p.validUntil && p.validUntil.getTime() < startOfTodayUTC().getTime()) {
    throw new Error("This proposal has expired");
  }
  const name = signer(fd, client.name);
  const now = new Date();
  const total = p.items.reduce((s, i) => s + i.amount, 0);

  await db.$transaction(async (tx) => {
    // Conditional update: a double-submit or concurrent accept can only win once.
    const claimed = await tx.proposal.updateMany({
      where: { id, status: "sent" },
      data: { status: "accepted", respondedAt: now, respondedByName: name, responseNote: optStr(fd.get("note")) },
    });
    if (claimed.count === 0) throw new Error("This proposal was already answered");
    const existing = await tx.milestone.count({ where: { projectId: p.projectId } });
    await tx.milestone.createMany({
      data: p.items.map((item, i) => ({
        projectId: p.projectId,
        title: item.title,
        description: item.description,
        amount: item.amount,
        dueDate: item.dueInDays != null ? addDays(now, item.dueInDays) : null,
        position: existing + i,
      })),
    });
    // Additional proposals (change orders) add to the budget instead of replacing it.
    const project = await tx.project.findUniqueOrThrow({ where: { id: p.projectId } });
    await tx.project.update({
      where: { id: p.projectId },
      data: { budget: (project.budget ?? 0) + total, status: "active" },
    });
  });
  await logActivity({
    workspaceId: client.workspaceId,
    projectId: p.projectId,
    actor: "client",
    actorName: name,
    message: `Accepted proposal "${p.title}"`,
  });
  revalidatePath(`/portal/${token}`, "layout");
}

export async function declineProposal(token: string, id: string, fd: FormData) {
  const { client, p } = await portalProposal(token, id);
  const name = signer(fd, client.name);
  const res = await db.proposal.updateMany({
    where: { id, status: "sent" },
    data: { status: "declined", respondedAt: new Date(), respondedByName: name, responseNote: optStr(fd.get("note")) },
  });
  if (res.count === 0) throw new Error("This proposal was already answered");
  await logActivity({
    workspaceId: client.workspaceId,
    projectId: p.projectId,
    actor: "client",
    actorName: name,
    message: `Declined proposal "${p.title}"`,
  });
  revalidatePath(`/portal/${token}`, "layout");
}

async function portalMilestone(token: string, id: string) {
  const client = await getPortalClient(token);
  const m = await db.milestone.findFirst({
    where: { id, status: "submitted", project: { clientId: client.id } },
  });
  if (!m) throw new Error("Milestone not found or not awaiting approval");
  return { client, m };
}

export async function approveMilestone(token: string, id: string, fd: FormData) {
  const { client, m } = await portalMilestone(token, id);
  const name = signer(fd, client.name);
  const res = await db.milestone.updateMany({
    where: { id, status: "submitted" },
    data: { status: "approved", approvedAt: new Date(), approvedBy: name, clientNote: optStr(fd.get("note")) },
  });
  if (res.count === 0) throw new Error("This milestone is no longer awaiting approval");
  await logActivity({
    workspaceId: client.workspaceId,
    projectId: m.projectId,
    actor: "client",
    actorName: name,
    message: `Approved milestone "${m.title}"`,
  });
  revalidatePath(`/portal/${token}`, "layout");
}

export async function requestMilestoneChanges(token: string, id: string, fd: FormData) {
  const { client, m } = await portalMilestone(token, id);
  const note = optStr(fd.get("note"));
  if (!note) throw new Error("Please describe the changes you need");
  const name = signer(fd, client.name);
  const res = await db.milestone.updateMany({
    where: { id, status: "submitted" },
    data: { status: "changes_requested", clientNote: note.slice(0, 5000) },
  });
  if (res.count === 0) throw new Error("This milestone is no longer awaiting approval");
  await logActivity({
    workspaceId: client.workspaceId,
    projectId: m.projectId,
    actor: "client",
    actorName: name,
    message: `Requested changes on "${m.title}": ${note}`,
  });
  revalidatePath(`/portal/${token}`, "layout");
}

// ------------------------------------------------------------ Payments

async function payableInvoice(token: string, id: string) {
  const client = await getPortalClient(token);
  const inv = await db.invoice.findFirst({
    where: { id, clientId: client.id, status: "sent" },
    include: { client: { select: { email: true, portalToken: true } } },
  });
  if (!inv) throw new Error("Invoice is not payable");
  return { client, inv };
}

export async function payWithStripe(token: string, id: string) {
  const { client, inv } = await payableInvoice(token, id);
  const url = await createStripeCheckout(client.workspace, inv);
  redirect(url);
}

export async function startRazorpayPayment(token: string, id: string) {
  const { client, inv } = await payableInvoice(token, id);
  const order = await createRazorpayOrder(client.workspace, inv);
  return {
    ...order,
    name: client.workspace.name,
    description: `Invoice ${inv.number}`,
    prefill: { name: client.name, email: client.email ?? undefined, contact: client.phone ?? undefined },
  };
}

export async function confirmRazorpayPayment(
  token: string,
  id: string,
  payload: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string },
) {
  const { client, inv } = await payableInvoice(token, id);
  const { razorpay } = paymentConfig(client.workspace);
  if (!razorpay.keySecret) throw new Error("Razorpay is not configured");
  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = payload ?? {};
  if (typeof orderId !== "string" || typeof paymentId !== "string" || typeof signature !== "string") {
    throw new Error("Invalid payment payload");
  }
  if (!inv.razorpayOrderId || orderId !== inv.razorpayOrderId) throw new Error("Order mismatch");
  if (!verifyRazorpayPaymentSignature(razorpay.keySecret, orderId, paymentId, signature)) {
    throw new Error("Payment signature verification failed");
  }
  // The signature proves Razorpay issued this payment for this order; confirm the amount
  // actually paid with Razorpay's API rather than trusting the order we created earlier.
  const payment = await fetchRazorpayPayment(client.workspace, paymentId);
  if (!payment || payment.order_id !== orderId || !["authorized", "captured"].includes(payment.status)) {
    throw new Error("Could not confirm the payment with Razorpay");
  }
  await settleRazorpayPayment(inv, payment.id, payment.amount, payment.currency);
  revalidatePath(`/portal/${token}`, "layout");
  return { ok: true };
}
