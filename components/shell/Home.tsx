"use client";

import Link from "next/link";
import { ArrowRight, AudioLines } from "lucide-react";
import { LogoMark } from "../brand/Logo";

/**
 * SilverStone Studio overview — the landing surface of the dashboard. Shows the
 * available tools and project areas as launch cards. New tools added to the
 * sidebar should get a card here too.
 */
export function Home() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-8 sm:py-10">
      {/* hero */}
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--color-surface-2)] ring-1 ring-[var(--color-line)]">
          <LogoMark className="h-8 w-8" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">
            SilverStone Studio
          </h1>
          <p className="text-sm text-[var(--color-ink-muted)]">
            Your central workspace for music production, tools, and projects.
          </p>
        </div>
      </div>

      {/* tools */}
      <section className="mt-10">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-subtle)]">
          Tools
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <LaunchCard
            href="/tools/pace-lyrics"
            icon={<AudioLines className="h-5 w-5" strokeWidth={1.75} />}
            title="Pace Lyrics"
            body="Sync lyrics to your track on a timeline, preview studio-grade karaoke, record vocal takes over the music, and export .lrc or a mixed MP3."
            cta="Open Pace Lyrics"
          />
        </div>
      </section>
    </div>
  );
}

function LaunchCard({
  href,
  icon,
  title,
  body,
  cta,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  body: string;
  cta: string;
}) {
  return (
    <Link
      href={href}
      className="group relative flex flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-5 transition-colors hover:border-[var(--color-line-strong)]"
    >
      <div className="absolute inset-0 bg-[radial-gradient(420px_140px_at_20%_0%,color-mix(in_srgb,var(--color-accent)_10%,transparent),transparent_70%)] opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="relative flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-surface-2)] text-[var(--color-accent)] ring-1 ring-[var(--color-line)]">
        {icon}
      </div>
      <h3 className="relative mt-4 text-base font-semibold text-[var(--color-ink)]">{title}</h3>
      <p className="relative mt-1.5 flex-1 text-sm leading-relaxed text-[var(--color-ink-muted)]">{body}</p>
      <span className="relative mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-accent)]">
        {cta}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

