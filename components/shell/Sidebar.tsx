"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, LogOut, Mic2, Wrench } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { Logo } from "../brand/Logo";
import { cn } from "@/lib/cn";

/**
 * A tool entry in the sidebar. Add future tools to TOOLS below and they appear
 * automatically — the dashboard is built to grow.
 */
interface ToolLink {
  href: string;
  label: string;
  summary: string;
  icon: React.ReactNode;
  match: (path: string) => boolean;
}

const TOOLS: ToolLink[] = [
  {
    href: "/tools/pace-lyrics",
    label: "Pace Lyrics",
    summary: "Sync lyrics to your track, preview karaoke, record takes, export .lrc.",
    icon: <Mic2 className="h-4 w-4" />,
    match: (p) => p.startsWith("/tools/pace-lyrics") || p.startsWith("/editor"),
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { cloudEnabled, email, signOut } = useAuth();

  return (
    <aside className="flex h-dvh w-[264px] shrink-0 flex-col border-r border-[var(--color-line)] bg-[var(--color-surface)]">
      {/* brand */}
      <div className="flex h-16 items-center border-b border-[var(--color-line)] px-4">
        <Link href="/" aria-label="SilverStone Studio home">
          <Logo />
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {/* overview */}
        <NavItem
          href="/"
          active={pathname === "/"}
          icon={<LayoutDashboard className="h-4 w-4" />}
          label="Overview"
        />

        {/* Tools */}
        <SectionLabel icon={<Wrench className="h-3.5 w-3.5" />}>Tools</SectionLabel>
        {TOOLS.map((t) => {
          const active = t.match(pathname);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "group mb-1 block rounded-[var(--radius-md)] border px-3 py-2.5 transition-colors",
                active
                  ? "border-[color-mix(in_srgb,var(--color-accent)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)]"
                  : "border-transparent hover:border-[var(--color-line)] hover:bg-[var(--color-surface-2)]"
              )}
            >
              <span className="flex items-center gap-2 text-sm font-medium text-[var(--color-ink)]">
                <span className={active ? "text-[var(--color-accent)]" : "text-[var(--color-ink-muted)]"}>
                  {t.icon}
                </span>
                {t.label}
              </span>
              <span className="mt-1 block text-[11px] leading-snug text-[var(--color-ink-subtle)]">
                {t.summary}
              </span>
            </Link>
          );
        })}

      </nav>

      {/* account */}
      {cloudEnabled && (
        <div className="border-t border-[var(--color-line)] p-3">
          <div className="flex items-center gap-2.5 rounded-[var(--radius-md)] px-2 py-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-2)] text-xs font-semibold uppercase text-[var(--color-ink)] ring-1 ring-[var(--color-line)]">
              {(email ?? "?").slice(0, 1)}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-[var(--color-ink-muted)]" title={email ?? undefined}>
              {email ?? "Signed in"}
            </span>
            <button
              onClick={() => void signOut()}
              aria-label="Sign out"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-ink-subtle)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-danger)]"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}

function SectionLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-1.5 mt-5 flex items-center gap-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-subtle)]">
      {icon}
      {children}
    </div>
  );
}

function NavItem({
  href,
  active,
  icon,
  label,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "mb-1 flex items-center gap-2.5 rounded-[var(--radius-sm)] px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-[var(--color-surface-2)] text-[var(--color-ink)]"
          : "text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
      )}
    >
      <span className={active ? "text-[var(--color-accent)]" : ""}>{icon}</span>
      {label}
    </Link>
  );
}
