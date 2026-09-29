"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { ownedInvoice, ownedProject } from "@/lib/scope";
import { computeTotals, lineAmount, MAX_AMOUNT, minutesToHours, parseMoney, parseTaxPercent } from "@/lib/money";
import { addDays, formatDate, optStr, parseDateInput, str } from "@/lib/utils";
import { logActivity } from "@/lib/activity";
import { invalidateCheckouts, markInvoicePaid } from "@/lib/payments";

function parseTaxBps(v: FormDataEntryValue | null): number {
  const bps = parseTaxPercent(v);
  if (Number.isNaN(bps)) throw new Error("Tax must be a percentage between 0 and 100");
  return bps;
}

function assertTotals(totals: { subtotal: number; total: number }) {
  if (totals.total < 0) throw new Error("Invoice total cannot be negative");
  if (Math.abs(totals.subtotal) > MAX_AMOUNT || totals.total > MAX_AMOUNT) throw new Error("Invoice total is too large");
}

/**
 * Build a draft invoice from approved milestones + unbilled time on a project.
 * The invoice number is allocated atomically from the workspace counter.
 */
export async function createInvoice(fd: FormData) {
  const { workspace, user } = await requireSession();
  const project = await ownedProject(str(fd.get("projectId")));
  const milestoneIds = fd.getAll("milestoneId").map(String);
  const timeEntryIds = fd.getAll("timeEntryId").map(String);

  const milestones = await db.milestone.findMany({
    where: { id: { in: milestoneIds }, projectId: project.id, status: "approved", invoiceItem: null },
    orderBy: { position: "asc" },
  });
  const entries = await db.timeEntry.findMany({
    where: {
      id: { in: timeEntryIds },
      projectId: project.id,
      billable: true,
      invoiceId: null,
      endedAt: { not: null },
    },
    orderBy: { startedAt: "asc" },
  });

  const lines: { description: string; quantity: number; unitAmount: number; milestoneId?: string }[] =
    milestones.map((m) => ({
      description: `Milestone: ${m.title}`,
      quantity: 1,
      unitAmount: m.amount,
      milestoneId: m.id,
    }));

  if (entries.length) {
    const minutes = entries.reduce((s, e) => s + e.minutes, 0);
    const from = formatDate(entries[0].startedAt);
    const to = formatDate(entries[entries.length - 1].startedAt);
    lines.push({
      description: `Hourly work (${from === to ? from : `${from} – ${to}`})`,
      quantity: minutesToHours(minutes),
      unitAmount: project.hourlyRate,
    });
  }

  const extra = str(fd.get("extraDescription"));
  if (extra) {
    const extraAmount = parseMoney(str(fd.get("extraAmount")));
    if (Number.isNaN(extraAmount)) throw new Error("Enter a valid amount for the custom line");
    lines.push({ description: extra.slice(0, 500), quantity: 1, unitAmount: extraAmount });
  }

  if (lines.length === 0) throw new Error("Select at least one milestone, time entry, or custom line");

  const taxBps = fd.has("taxRate") ? parseTaxBps(fd.get("taxRate")) : workspace.defaultTaxBps;
  const totals = computeTotals(lines, taxBps);
  assertTotals(totals);

  const invoice = await db.$transaction(async (tx) => {
    const ws = await tx.workspace.update({
      where: { id: workspace.id },
      data: { nextInvoiceNumber: { increment: 1 } },
    });
    const number = `${ws.invoicePrefix}${String(ws.nextInvoiceNumber - 1).padStart(4, "0")}`;
    const inv = await tx.invoice.create({
      data: {
        workspaceId: workspace.id,
        clientId: project.clientId,
        projectId: project.id,
        number,
        currency: project.currency,
        dueDate: parseDateInput(fd.get("dueDate")) ?? addDays(new Date(), ws.paymentTerms),
        notes: optStr(fd.get("notes")) ?? ws.invoiceFooter,
        taxBps,
        ...totals,
        items: {
          create: lines.map((l, i) => ({
            description: l.description,
            quantity: l.quantity,
            unitAmount: l.unitAmount,
            amount: lineAmount(l),
            milestoneId: l.milestoneId ?? null,
            position: i,
          })),
        },
      },
    });
    // Claim time entries atomically: if a concurrent invoice already took any of them,
    // abort instead of billing the same hours twice. (Milestones are protected by the
    // unique InvoiceItem.milestoneId constraint.)
    if (entries.length) {
      const claimed = await tx.timeEntry.updateMany({
        where: { id: { in: entries.map((e) => e.id) }, invoiceId: null },
        data: { invoiceId: inv.id },
      });
      if (claimed.count !== entries.length) {
        throw new Error("Some time entries were just invoiced elsewhere. Please reload and try again.");
      }
    }
    return inv;
  });

  await logActivity({
    workspaceId: workspace.id,
    projectId: project.id,
    actor: "freelancer",
    actorName: user.name,
    message: `Created invoice ${invoice.number}`,
  });
  redirect(`/invoices/${invoice.id}`);
}

export async function saveInvoice(id: string, fd: FormData) {
  const inv = await ownedInvoice(id);
  if (inv.status !== "draft") throw new Error("Only draft invoices can be edited");

  // Milestone links can only be kept (or dropped), never pointed at arbitrary IDs,
  // otherwise a crafted form could link another project's or tenant's milestone.
  const linked = new Set(
    (
      await db.invoiceItem.findMany({
        where: { invoiceId: id, milestoneId: { not: null } },
        select: { milestoneId: true },
      })
    ).map((i) => i.milestoneId!),
  );
  const seen = new Set<string>();

  const descs = fd.getAll("item_description").map(String);
  const qtys = fd.getAll("item_quantity").map(String);
  const units = fd.getAll("item_unit").map(String);
  const mids = fd.getAll("item_milestone").map(String);

  const lines = descs
    .map((d, i) => {
      const mid = mids[i] && linked.has(mids[i]) && !seen.has(mids[i]) ? mids[i] : null;
      if (mid) seen.add(mid);
      return {
        description: d.trim().slice(0, 500),
        quantity: Number(qtys[i] || "1"),
        unitAmount: parseMoney(units[i] || "0"),
        milestoneId: mid,
        position: i,
      };
    })
    .filter((l) => l.description !== "");
  for (const l of lines) {
    if (!Number.isFinite(l.quantity) || l.quantity < 0 || l.quantity > 100_000 || Number.isNaN(l.unitAmount)) {
      throw new Error(`Invalid quantity or price on "${l.description}"`);
    }
  }

  const taxBps = parseTaxBps(fd.get("taxRate"));
  const totals = computeTotals(lines, taxBps);
  assertTotals(totals);
  await db.$transaction([
    db.invoiceItem.deleteMany({ where: { invoiceId: id } }),
    db.invoice.update({
      where: { id },
      data: {
        dueDate: parseDateInput(fd.get("dueDate")),
        issueDate: parseDateInput(fd.get("issueDate")) ?? inv.issueDate,
        notes: optStr(fd.get("notes")),
        taxBps,
        ...totals,
        items: { create: lines.map((l) => ({ ...l, amount: lineAmount(l) })) },
      },
    }),
  ]);
  if (fd.get("intent") === "send") return sendInvoice(id);
  revalidatePath(`/invoices/${id}`);
}

export async function sendInvoice(id: string) {
  const { user } = await requireSession();
  const inv = await ownedInvoice(id);
  if (inv.status !== "draft") return;
  if (inv.total <= 0) throw new Error("Invoice total must be greater than zero");
  const res = await db.invoice.updateMany({ where: { id, status: "draft" }, data: { status: "sent", sentAt: new Date() } });
  if (res.count === 0) return;
  await logActivity({
    workspaceId: inv.workspaceId,
    projectId: inv.projectId,
    actor: "freelancer",
    actorName: user.name,
    message: `Sent invoice ${inv.number}`,
  });
  revalidatePath(`/invoices/${id}`);
}

export async function revertInvoiceToDraft(id: string) {
  const { workspace } = await requireSession();
  const inv = await ownedInvoice(id);
  if (inv.status !== "sent") return;
  const res = await db.invoice.updateMany({ where: { id, status: "sent" }, data: { status: "draft", sentAt: null } });
  if (res.count === 0) return;
  // Any open Stripe session / Razorpay order was for the old amount.
  await invalidateCheckouts(inv, workspace);
  revalidatePath(`/invoices/${id}`);
}

export async function markInvoicePaidManually(id: string, fd: FormData) {
  const inv = await ownedInvoice(id);
  await markInvoicePaid(inv.id, "manual", optStr(fd.get("reference"))?.slice(0, 200) ?? null);
  revalidatePath(`/invoices/${id}`);
}

/** Void releases linked milestones + time so they can be re-invoiced. */
export async function voidInvoice(id: string) {
  const { workspace } = await requireSession();
  const inv = await ownedInvoice(id);
  if (inv.status === "paid" || inv.status === "void") throw new Error("Paid or voided invoices cannot be voided");
  await invalidateCheckouts(inv, workspace);
  await db.$transaction([
    db.timeEntry.updateMany({ where: { invoiceId: id }, data: { invoiceId: null } }),
    db.invoiceItem.updateMany({ where: { invoiceId: id }, data: { milestoneId: null } }),
    db.invoice.updateMany({ where: { id, status: { in: ["draft", "sent"] } }, data: { status: "void" } }),
  ]);
  revalidatePath(`/invoices/${id}`);
}

export async function deleteInvoice(id: string) {
  const inv = await ownedInvoice(id);
  if (inv.status !== "draft") throw new Error("Only drafts can be deleted; void it instead");
  await db.$transaction([
    db.timeEntry.updateMany({ where: { invoiceId: id }, data: { invoiceId: null } }),
    db.invoice.delete({ where: { id } }),
  ]);
  redirect("/invoices");
}
