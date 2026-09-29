import { requireSession } from "@/lib/auth";
import { ownedProject } from "@/lib/scope";
import { deleteProject, updateProject } from "@/server/projects";
import { Card, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { ProjectFields } from "../../ProjectFields";

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspace } = await requireSession();
  const project = await ownedProject(id);
  return (
    <>
      <PageHeader title="Edit project" back={{ href: `/projects/${id}`, label: project.name }} />
      <Card className="max-w-2xl">
        <form action={updateProject.bind(null, id)} className="space-y-5">
          <ProjectFields project={project} defaultCurrency={workspace.currency} />
          <SubmitButton>Save project</SubmitButton>
        </form>
      </Card>
      <Card className="mt-6 max-w-2xl" title="Danger zone">
        <form action={deleteProject.bind(null, id)}>
          <SubmitButton className="btn-danger" confirm="Delete this project with all milestones, time entries and proposals?">
            Delete project
          </SubmitButton>
        </form>
      </Card>
    </>
  );
}
