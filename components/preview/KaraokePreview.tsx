"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { useStore } from "@/lib/store";
import {
  activeLineIndex,
  activeWordIndex,
  effectiveEnd,
  effectiveStart,
  lineText,
  wordProgress,
} from "@/lib/model";
import type { Line } from "@/lib/types";
import { cn } from "@/lib/cn";
import { PaceGuide } from "./PaceGuide";

export function KaraokePreview({ idleMessage }: { idleMessage?: string } = {}) {
  const lines = useStore((s) => s.project?.lines ?? []);
  const t = useStore((s) => s.currentTime);
  const title = useStore((s) => s.project?.title ?? "");
  const artist = useStore((s) => s.project?.artist ?? "");
  const COUNTDOWN_WINDOW = useStore((s) => s.project?.settings.leadInSeconds ?? 4);
  const wordWipe = useStore((s) => s.project?.settings.wordWipe ?? true);

  const activeIdx = useMemo(() => activeLineIndex(lines, t), [lines, t]);

  // Find the next upcoming timed line (for the "get ready" state).
  const upcoming = useMemo(() => {
    for (let i = 0; i < lines.length; i += 1) {
      const s = effectiveStart(lines[i]);
      if (s != null && s > t) return { index: i, start: s };
    }
    return null;
  }, [lines, t]);

  const active = activeIdx >= 0 ? lines[activeIdx] : null;
  const nextLine = active ? lines[activeIdx + 1] : upcoming ? lines[upcoming.index] : null;

  const leadIn =
    !active && upcoming ? Math.max(0, upcoming.start - t) : null;
  const showCountdown = leadIn != null && leadIn <= COUNTDOWN_WINDOW;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-bg)] px-6 py-10">
      {/* stage glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/2 h-64 -translate-y-1/2 bg-[radial-gradient(600px_200px_at_50%_50%,rgba(56,189,248,0.12),transparent_70%)]"
      />

      {/* header chip */}
      {(title || artist) && (
        <div className="absolute left-1/2 top-6 -translate-x-1/2 text-center">
          <p className="text-sm font-medium text-[var(--color-ink)]">{title}</p>
          {artist && <p className="text-xs text-[var(--color-ink-subtle)]">{artist}</p>}
        </div>
      )}

      <div className="relative flex w-full max-w-3xl flex-col items-center gap-8">
        {active ? (
          <>
            <ActiveLine line={active} t={t} wordWipe={wordWipe} />
            <PaceGuide line={active} t={t} />
          </>
        ) : showCountdown ? (
          <Countdown seconds={leadIn!} line={nextLine} />
        ) : (
          <IdleState hasLines={lines.length > 0} message={idleMessage} />
        )}

        {/* next line preview */}
        {active && nextLine && (
          <motion.p
            key={nextLine.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            className="max-w-2xl text-center text-xl font-medium text-[var(--color-ink-subtle)]"
          >
            {lineText(nextLine)}
          </motion.p>
        )}
      </div>
    </div>
  );
}

function ActiveLine({ line, t, wordWipe }: { line: Line; t: number; wordWipe: boolean }) {
  const hasWordTiming = wordWipe && line.words.some((w) => w.start != null);
  const activeWord = activeWordIndex(line, t);

  if (!hasWordTiming) {
    // Line-level wipe across the whole line.
    const start = effectiveStart(line) ?? 0;
    const end = effectiveEnd(line) ?? start;
    const pct =
      end > start ? Math.min(100, Math.max(0, ((t - start) / (end - start)) * 100)) : 100;
    return (
      <motion.div
        key={line.id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        <span
          className="karaoke-wipe text-center text-4xl font-bold leading-tight tracking-tight sm:text-5xl"
          style={{ ["--wipe" as string]: `${pct}%` } as React.CSSProperties}
        >
          {lineText(line)}
        </span>
      </motion.div>
    );
  }

  return (
    <motion.p
      key={line.id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1 text-center text-4xl font-bold leading-tight tracking-tight sm:text-5xl"
    >
      {line.words.map((word, i) => {
        const sung = i < activeWord;
        const singing = i === activeWord;
        const pct = singing ? wordProgress(line, i, t) * 100 : sung ? 100 : 0;
        return (
          <span
            key={word.id}
            className={cn(
              singing ? "karaoke-wipe" : sung ? "text-[var(--color-accent)]" : "text-[var(--color-ink-subtle)]",
              singing && "drop-shadow-[0_0_20px_rgba(56,189,248,0.35)]"
            )}
            style={singing ? ({ ["--wipe" as string]: `${pct}%` } as React.CSSProperties) : undefined}
          >
            {word.text}
          </span>
        );
      })}
    </motion.p>
  );
}

function Countdown({ seconds, line }: { seconds: number; line: Line | null }) {
  const count = Math.ceil(seconds);
  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex items-center gap-3">
        {[3, 2, 1].map((n) => (
          <span
            key={n}
            className={cn(
              "h-3 w-3 rounded-full transition-all duration-200",
              n >= count && count <= 3
                ? "scale-110 bg-[var(--color-accent)] shadow-[0_0_12px_rgba(56,189,248,0.6)]"
                : "bg-[var(--color-line-strong)]"
            )}
          />
        ))}
      </div>
      {line && (
        <p className="max-w-2xl text-center text-2xl font-semibold text-[var(--color-ink-muted)] sm:text-3xl">
          {lineText(line)}
        </p>
      )}
      <p className="text-xs uppercase tracking-widest text-[var(--color-ink-subtle)]">
        Get ready
      </p>
    </div>
  );
}

function IdleState({ hasLines, message }: { hasLines: boolean; message?: string }) {
  return (
    <p className="text-center text-lg text-[var(--color-ink-subtle)]">
      {message ??
        (hasLines
          ? "Press play to preview your synced karaoke."
          : "Add lyrics and timing to preview the karaoke here.")}
    </p>
  );
}
