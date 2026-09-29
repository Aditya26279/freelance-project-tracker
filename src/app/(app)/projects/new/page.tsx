import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { createProject } from "@/server/projects";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { ProjectFields } from "../ProjectFields";

export const metadata = { title: "New project" };

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ clientId?: string }> }) {
  const { workspace } = await requireSession();
  const { clientId } = await searchParams;
  const clients = await db.client.findMany({
    where: { workspaceId: workspace.id },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <>
      <PageHeader title="New project" back={{ href: "/projects", label: "Projects" }} />
      <Card className="max-w-2xl">
        {clients.length === 0 ? (
          <EmptyState
            title="Add a client first"
            body="Projects belong to a client."
            action={<Link href="/clients/new" className="btn-primary">Add client</Link>}
          />
        ) : (
          <form action={createProject} className="space-y-5">
            <ProjectFields clients={clients} defaultClientId={clientId} defaultCurrency={workspace.currency} />
            <SubmitButton>Create project</SubmitButton>
          </form>
        )}
      </Card>
    </>
  );
}
