import { Sidebar } from "@/components/shell/Sidebar";

/**
 * Dashboard shell — persistent sidebar + scrollable content region. Applies to
 * every top-level dashboard route (overview, tools, projects). The focused
 * Pace Lyric editor lives outside this group so it can run full-screen.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
