/**
 * Demo data: one freelancer, two clients, projects in various states.
 *   npm run db:seed
 * Login: demo@clientdesk.test / demo12345
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

const db = new PrismaClient();
const token = () => randomBytes(24).toString("base64url");
const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000);

async function main() {
  await db.user.deleteMany({ where: { email: "demo@clientdesk.test" } });
  await db.workspace.deleteMany({ where: { name: "Demo Studio" } });

  const ws = await db.workspace.create({
    data: {
      name: "Demo Studio",
      businessEmail: "hello@demostudio.test",
      address: "221B Baker Street\nLondon",
      currency: "USD",
      defaultTaxBps: 0,
      invoiceFooter: "Thank you for your business! Bank: ACME Bank · IBAN XX00 0000 0000 0000",
      nextInvoiceNumber: 2,
    },
  });
  const user = await db.user.create({
    data: {
      name: "Alex Freelancer",
      email: "demo@clientdesk.test",
      passwordHash: await bcrypt.hash("demo12345", 10),
      memberships: { create: { workspaceId: ws.id, role: "owner" } },
    },
  });

  const acme = await db.client.create({
    data: { workspaceId: ws.id, name: "Priya Sharma", company: "Acme Retail", email: "priya@acme.test", portalToken: token() },
  });
  const nova = await db.client.create({
    data: { workspaceId: ws.id, name: "Sam Lee", company: "Nova Labs", email: "sam@nova.test", portalToken: token() },
  });

  // Fixed-price project with milestones in each state
  const site = await db.project.create({
    data: {
      workspaceId: ws.id,
      clientId: acme.id,
      name: "E-commerce redesign",
      description: "Redesign of the storefront and checkout flow.",
      currency: "USD",
      billingType: "fixed",
      budget: 900000,
      startDate: daysAgo(40),
      dueDate: daysAgo(-30),
    },
  });
  const [discovery, design] = await Promise.all([
    db.milestone.create({
      data: { projectId: site.id, position: 0, title: "Discovery & wireframes", amount: 200000, status: "approved", approvedAt: daysAgo(20), approvedBy: "Priya Sharma" },
    }),
    db.milestone.create({
      data: { projectId: site.id, position: 1, title: "Visual design", amount: 300000, status: "approved", approvedAt: daysAgo(3), approvedBy: "Priya Sharma" },
    }),
  ]);
  await db.milestone.create({
    data: {
      projectId: site.id,
      position: 2,
      title: "Frontend build",
      amount: 300000,
      status: "submitted",
      submittedAt: daysAgo(1),
      deliverable: "Staging: https://staging.acme.test\nAll pages built, checkout wired to test mode.",
    },
  });
  await db.milestone.create({
    data: { projectId: site.id, position: 3, title: "Launch & handover", amount: 100000, dueDate: daysAgo(-25) },
  });
  await db.proposal.create({
    data: {
      workspaceId: ws.id,
      clientId: acme.id,
      projectId: site.id,
      title: "E-commerce redesign",
      status: "accepted",
      currency: "USD",
      summary: "A faster, mobile-first storefront.",
      sentAt: daysAgo(42),
      respondedAt: daysAgo(41),
      respondedByName: "Priya Sharma",
      items: {
        create: [
          { title: "Discovery & wireframes", amount: 200000, position: 0 },
          { title: "Visual design", amount: 300000, position: 1 },
          { title: "Frontend build", amount: 300000, position: 2 },
          { title: "Launch & handover", amount: 100000, position: 3 },
        ],
      },
    },
  });
  // Paid invoice for the first milestone
  await db.invoice.create({
    data: {
      workspaceId: ws.id,
      clientId: acme.id,
      projectId: site.id,
      number: "INV-0001",
      status: "paid",
      currency: "USD",
      issueDate: daysAgo(19),
      dueDate: daysAgo(5),
      sentAt: daysAgo(19),
      paidAt: daysAgo(10),
      paymentProvider: "manual",
      subtotal: 200000,
      total: 200000,
      items: {
        create: [{ description: `Milestone: ${discovery.title}`, quantity: 1, unitAmount: 200000, amount: 200000, milestoneId: discovery.id }],
      },
    },
  });
  void design; // approved, ready to invoice. Shows up on the dashboard.

  // Hourly retainer with time entries
  const retainer = await db.project.create({
    data: {
      workspaceId: ws.id,
      clientId: nova.id,
      name: "Platform maintenance",
      currency: "USD",
      billingType: "hourly",
      hourlyRate: 9500,
    },
  });
  const entries = [
    [6, 150, "Upgrade dependencies"],
    [5, 90, "Fix login rate limiting"],
    [3, 240, "Build CSV export"],
    [1, 75, "Code review & deploy"],
  ] as const;
  for (const [ago, minutes, description] of entries) {
    const startedAt = daysAgo(ago);
    await db.timeEntry.create({
      data: {
        projectId: retainer.id,
        userId: user.id,
        description,
        startedAt,
        endedAt: new Date(startedAt.getTime() + minutes * 60000),
        minutes,
      },
    });
  }

  // A proposal awaiting the client's response
  const mobile = await db.project.create({
    data: { workspaceId: ws.id, clientId: nova.id, name: "Mobile app MVP", currency: "USD", status: "on_hold" },
  });
  await db.proposal.create({
    data: {
      workspaceId: ws.id,
      clientId: nova.id,
      projectId: mobile.id,
      title: "Mobile app MVP",
      status: "sent",
      currency: "USD",
      sentAt: daysAgo(2),
      validUntil: daysAgo(-14),
      summary: "Ship a cross-platform MVP in 6 weeks to validate the core booking flow with real users.",
      terms: "50% of each milestone is due on approval. Two revision rounds per milestone included.",
      items: {
        create: [
          { title: "UX & clickable prototype", amount: 250000, dueInDays: 10, position: 0, description: "User flows, wireframes, Figma prototype." },
          { title: "App build (iOS + Android)", amount: 800000, dueInDays: 35, position: 1 },
          { title: "Store submission", amount: 100000, dueInDays: 42, position: 2 },
        ],
      },
    },
  });

  const activity = [
    [acme, site.id, "client", "Priya Sharma", 'Approved milestone "Visual design"', 3],
    [acme, site.id, "freelancer", user.name, 'Submitted milestone "Frontend build" for approval', 1],
    [nova, mobile.id, "freelancer", user.name, 'Sent proposal "Mobile app MVP" to client', 2],
  ] as const;
  for (const [, projectId, actor, actorName, message, ago] of activity) {
    await db.activity.create({ data: { workspaceId: ws.id, projectId, actor, actorName, message, createdAt: daysAgo(ago) } });
  }

  console.log("Seeded. Log in with demo@clientdesk.test / demo12345");
  console.log(`Acme portal: /portal/${acme.portalToken}`);
  console.log(`Nova portal: /portal/${nova.portalToken}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
