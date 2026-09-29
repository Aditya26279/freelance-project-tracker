"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/clients", label: "Clients" },
  { href: "/projects", label: "Projects" },
  { href: "/proposals", label: "Proposals" },
  { href: "/time", label: "Time" },
  { href: "/invoices", label: "Invoices" },
  { href: "/settings", label: "Settings" },
];

export function NavLinks({ pendingApprovals, horizontal }: { pendingApprovals: number; horizontal?: boolean }) {
  const pathname = usePathname();
  return (
    <nav className={cn(horizontal ? "flex gap-1 overflow-x-auto" : "flex flex-col gap-0.5")}>
      {LINKS.map((l) => {
        const active = pathname === l.href || pathname.startsWith(l.href + "/");
        return (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              "flex items-center justify-between whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition",
              active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            )}
          >
            {l.label}
            {l.href === "/projects" && pendingApprovals > 0 && !horizontal && (
              <span
                title="Milestones awaiting client approval"
                className="rounded-full bg-amber-100 px-1.5 text-xs font-semibold text-amber-700"
              >
                {pendingApprovals}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
