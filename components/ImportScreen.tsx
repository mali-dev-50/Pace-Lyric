"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, AudioLines, FileAudio, UploadCloud, Waves } from "lucide-react";
import { useStore } from "@/lib/store";
import { extractPeaks } from "@/lib/waveform";
import { cn } from "@/lib/cn";

export function ImportScreen() {
  const attachAudio = useStore((s) => s.attachAudio);
  const setPeaks = useStore((s) => s.setPeaks);
  const projectName = useStore((s) => s.project?.name ?? "Project");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (!/audio\/(mpeg|mp3)|\.mp3$/i.test(file.type + file.name)) {
      setError("Please choose an MP3 audio file.");
      return;
    }
    await attachAudio(file, file.name);
    try {
      const peaks = await extractPeaks(file);
      setPeaks(peaks);
    } catch {
      setError("Audio imported, but the waveform could not be generated.");
    }
  }

  return (
    <div className="relative flex min-h-dvh flex-col">
      <div className="flex items-center justify-between px-4 py-3">
        <Link
          href="/tools/pace-lyrics"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)]"
        >
          <ArrowLeft className="h-4 w-4" /> Pace Lyrics
        </Link>
        <span className="truncate text-sm font-medium text-[var(--color-ink)]">{projectName}</span>
        <span className="w-20" />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-2xl"
        >
          <div className="mb-10 flex flex-col items-center text-center">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--color-surface-2)] ring-1 ring-[var(--color-line)]">
              <AudioLines className="h-7 w-7 text-[var(--color-accent)]" strokeWidth={1.75} />
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-[var(--color-ink)]">
              Import your track
            </h1>
            <p className="mt-2 max-w-md text-[var(--color-ink-muted)]">
              Add the MP3 for <span className="text-[var(--color-ink)]">{projectName}</span>. Then
              paste lyrics and start timing.
            </p>
          </div>

          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void handleFile(e.dataTransfer.files?.[0]);
            }}
            className={cn(
              "group relative flex cursor-pointer flex-col items-center justify-center rounded-[var(--radius-xl)] border-2 border-dashed px-8 py-16 text-center transition-colors",
              dragging
                ? "border-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)]"
                : "border-[var(--color-line-strong)] bg-[var(--color-surface)] hover:border-[var(--color-accent)]"
            )}
          >
            <input
              ref={inputRef}
              type="file"
              accept="audio/mpeg,audio/mp3,.mp3"
              className="sr-only"
              onChange={(e) => void handleFile(e.target.files?.[0])}
            />
            <div
              className={cn(
                "mb-4 flex h-16 w-16 items-center justify-center rounded-full transition-transform",
                dragging ? "scale-110" : "group-hover:scale-105",
                "bg-[var(--color-surface-2)] ring-1 ring-[var(--color-line)]"
              )}
            >
              <UploadCloud className="h-8 w-8 text-[var(--color-accent)]" strokeWidth={1.75} />
            </div>
            <p className="text-lg font-medium text-[var(--color-ink)]">Drop your MP3 here</p>
            <p className="mt-1 text-sm text-[var(--color-ink-subtle)]">
              or click to browse — files stay on your device
            </p>
          </label>

          {error && (
            <p className="mt-4 text-center text-sm text-[var(--color-danger)]" role="alert">
              {error}
            </p>
          )}

          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Feature icon={<FileAudio className="h-5 w-5" />} title="Import MP3">
              Load any track from your machine.
            </Feature>
            <Feature icon={<Waves className="h-5 w-5" />} title="Timeline sync">
              Drag flags and regions to time lyrics.
            </Feature>
            <Feature icon={<AudioLines className="h-5 w-5" />} title="Export LRC">
              Ship enhanced, word-level karaoke.
            </Feature>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function Feature({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
      <div className="mb-2 text-[var(--color-accent)]">{icon}</div>
      <p className="text-sm font-medium text-[var(--color-ink)]">{title}</p>
      <p className="mt-0.5 text-xs text-[var(--color-ink-subtle)]">{children}</p>
    </div>
  );
}
