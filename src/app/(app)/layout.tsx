import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { logout } from "../(auth)/actions";
import { stopTimer } from "@/server/time";
import { Elapsed, SubmitButton } from "@/components/client";
import { NavLinks } from "./NavLinks";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, workspace } = await requireSession();
  const [running, pendingApprovals] = await Promise.all([
    db.timeEntry.findFirst({
      where: { userId: user.id, endedAt: null },
      include: { project: { select: { id: true, name: true } } },
    }),
    db.milestone.count({ where: { status: "submitted", project: { workspaceId: workspace.id } } }),
  ]);

  return (
    <div className="flex min-h-screen">
      <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white px-3 py-5 md:flex">
        <Link href="/dashboard" className="mb-6 px-3 text-lg font-semibold tracking-tight">
          <span className="text-brand-600">●</span> Clientdesk
        </Link>
        <NavLinks pendingApprovals={pendingApprovals} />
        <div className="mt-auto border-t border-slate-100 px-3 pt-4">
          <p className="truncate text-sm font-medium">{workspace.name}</p>
          <p className="truncate text-xs text-slate-500">{user.email}</p>
          <form action={logout} className="mt-2">
            <button className="text-xs text-slate-500 hover:text-slate-800">Log out</button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile nav */}
        <div className="no-print border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <NavLinks pendingApprovals={pendingApprovals} horizontal />
        </div>

        {running && (
          <div className="no-print flex items-center justify-between gap-3 border-b border-emerald-200 bg-emerald-50 px-6 py-2 text-sm">
            <span className="flex items-center gap-2 text-emerald-800">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
              Tracking{" "}
              <Link href={`/projects/${running.project.id}`} className="font-medium underline">
                {running.project.name}
              </Link>
              {running.description && <span className="text-emerald-700">· {running.description}</span>}
              <Elapsed since={running.startedAt.toISOString()} />
            </span>
            <form action={stopTimer}>
              <SubmitButton className="btn-success btn-sm" pendingText="Stopping…">
                Stop timer
              </SubmitButton>
            </form>
          </div>
        )}

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
