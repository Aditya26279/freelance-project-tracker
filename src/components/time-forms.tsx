import { addTimeEntry, startTimer } from "@/server/time";
import { toDateInput } from "@/lib/utils";
import { SubmitButton } from "./client";

type ProjectOpt = { id: string; name: string; milestones: { id: string; title: string }[] };

function ProjectSelect({ projects, fixed }: { projects: ProjectOpt[]; fixed?: string }) {
  if (fixed) return <input type="hidden" name="projectId" value={fixed} />;
  return (
    <select name="projectId" required className="input sm:w-56">
      <option value="">Project…</option>
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}

function MilestoneSelect({ milestones }: { milestones?: { id: string; title: string }[] }) {
  if (!milestones?.length) return null;
  return (
    <select name="milestoneId" className="input sm:w-48" defaultValue="">
      <option value="">No milestone</option>
      {milestones.map((m) => (
        <option key={m.id} value={m.id}>
          {m.title}
        </option>
      ))}
    </select>
  );
}

export function StartTimerForm({ projects, projectId }: { projects: ProjectOpt[]; projectId?: string }) {
  const milestones = projectId ? projects.find((p) => p.id === projectId)?.milestones : undefined;
  return (
    <form action={startTimer} className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <ProjectSelect projects={projects} fixed={projectId} />
      <MilestoneSelect milestones={milestones} />
      <input name="description" placeholder="What are you working on?" className="input flex-1" />
      <SubmitButton className="btn-success" pendingText="Starting…">
        ▶ Start timer
      </SubmitButton>
    </form>
  );
}

export function ManualTimeForm({ projects, projectId }: { projects: ProjectOpt[]; projectId?: string }) {
  const milestones = projectId ? projects.find((p) => p.id === projectId)?.milestones : undefined;
  return (
    <form action={addTimeEntry} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <ProjectSelect projects={projects} fixed={projectId} />
      <MilestoneSelect milestones={milestones} />
      <input name="date" type="date" defaultValue={toDateInput(new Date())} className="input sm:w-40" />
      <input name="duration" required placeholder="1.5 or 1:30" className="input sm:w-28" />
      <input name="description" placeholder="Description" className="input flex-1" />
      <label className="flex items-center gap-1.5 text-sm text-slate-600">
        <input type="checkbox" name="billable" defaultChecked /> Billable
      </label>
      <SubmitButton className="btn-secondary">Add entry</SubmitButton>
    </form>
  );
}
