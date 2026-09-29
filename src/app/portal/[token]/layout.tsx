import Link from "next/link";
import type { Metadata } from "next";
import { getPortalClient } from "@/lib/portal";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PortalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const client = await getPortalClient(token);
  return (
    <div className="min-h-screen">
      <header className="no-print border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href={`/portal/${token}`} className="font-semibold tracking-tight">
            {client.workspace.name}
          </Link>
          <span className="text-sm text-slate-500">Client portal · {client.company ?? client.name}</span>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">{children}</main>
      <footer className="no-print pb-8 text-center text-xs text-slate-400">Powered by Clientdesk</footer>
    </div>
  );
}
