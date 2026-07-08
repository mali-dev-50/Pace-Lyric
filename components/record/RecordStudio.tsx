"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Circle, Download, Headphones, Loader2, Mic, RotateCcw, Square, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { KaraokeRecorder, prepareTrack, type Take } from "@/lib/recorder";
import { formatTimecode } from "@/lib/time";
import { Button } from "../ui/Button";
import { KaraokePreview } from "../preview/KaraokePreview";

type Phase = "idle" | "preparing" | "recording" | "encoding" | "done";

export function RecordStudio() {
  const audioUrl = useStore((s) => s.audioUrl);
  const projectName = useStore((s) => s.project?.name ?? "take");
  const pause = useStore((s) => s.pause);
  const seek = useStore((s) => s.seek);
  const setCurrentTime = useStore((s) => s.setCurrentTime);

  const recorderRef = useRef<KaraokeRecorder | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [take, setTake] = useState<Take | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Clean up any object URL on unmount / new take.
  useEffect(() => {
    return () => {
      if (take) URL.revokeObjectURL(take.url);
    };
  }, [take]);

  const finish = useCallback(async () => {
    const rec = recorderRef.current;
    if (!rec || !rec.recording) return;
    setPhase("encoding");
    try {
      const result = await rec.stop();
      setTake(result);
      setPhase("done");
    } catch {
      setError("Something went wrong while rendering the MP3.");
      setPhase("idle");
    } finally {
      recorderRef.current = null;
      seek(0);
    }
  }, [seek]);

  const startRecording = useCallback(async () => {
    if (!audioUrl) return;
    setError(null);
    if (take) {
      URL.revokeObjectURL(take.url);
      setTake(null);
    }
    setPhase("preparing");
    pause(); // stop the normal player; the recorder owns audio during a take
    try {
      const buffer = await prepareTrack(audioUrl);
      const rec = new KaraokeRecorder();
      recorderRef.current = rec;
      await rec.start(buffer, {
        startAt: 0,
        onTick: (t) => {
          setElapsed(t);
          setCurrentTime(t); // drives the karaoke preview animation
        },
        onComplete: () => void finish(),
      });
      setPhase("recording");
    } catch (err) {
      const name = (err as DOMException)?.name;
      setError(
        name === "NotAllowedError"
          ? "Microphone access was denied. Allow the mic and try again."
          : name === "NotFoundError"
            ? "No microphone was found. Connect one and try again."
            : "Couldn't start recording. Check microphone permissions."
      );
      setPhase("idle");
      recorderRef.current = null;
    }
  }, [audioUrl, take, pause, setCurrentTime, finish]);

  const discard = () => {
    if (take) URL.revokeObjectURL(take.url);
    setTake(null);
    setPhase("idle");
    setElapsed(0);
    seek(0);
  };

  const downloadName = `${projectName.replace(/[^\w\-]+/g, "_")}_take.mp3`;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* karaoke guide */}
      <div className="min-h-0 flex-1">
        <KaraokePreview />
      </div>

      {/* record console */}
      <section className="shrink-0 rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
        <div className="mb-3 flex items-center gap-2 text-xs text-[var(--color-ink-subtle)]">
          <Headphones className="h-3.5 w-3.5 shrink-0 text-[var(--color-accent)]" />
          Use headphones so the mic captures only your voice — it&apos;s mixed with the track into one MP3.
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {phase === "idle" && (
            <Button variant="primary" size="lg" onClick={startRecording} disabled={!audioUrl}>
              <Mic className="h-5 w-5" /> Record take
            </Button>
          )}

          {phase === "preparing" && (
            <Button variant="primary" size="lg" disabled>
              <Loader2 className="h-5 w-5 animate-spin" /> Preparing…
            </Button>
          )}

          {phase === "recording" && (
            <>
              <Button
                variant="danger"
                size="lg"
                onClick={() => void finish()}
                className="border-[var(--color-danger)] bg-[color-mix(in_srgb,var(--color-danger)_16%,transparent)]"
              >
                <Square className="h-4 w-4 fill-current" /> Stop
              </Button>
              <div className="flex items-center gap-2 font-mono text-lg tabular-nums text-[var(--color-ink)]">
                <Circle className="h-3 w-3 animate-pulse fill-[var(--color-danger)] text-[var(--color-danger)]" />
                {formatTimecode(elapsed)}
              </div>
              <span className="text-sm text-[var(--color-ink-subtle)]">Recording — sing along.</span>
            </>
          )}

          {phase === "encoding" && (
            <div className="flex items-center gap-2 text-sm text-[var(--color-ink-muted)]">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--color-accent)]" /> Rendering your MP3…
            </div>
          )}

          <AnimatePresence>
            {phase === "done" && take && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex w-full flex-wrap items-center gap-4"
              >
                <div className="flex min-w-[240px] flex-1 items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-bg)] p-2">
                  <span className="rounded-[var(--radius-xs)] bg-[color-mix(in_srgb,var(--color-positive)_16%,transparent)] px-2 py-1 text-[11px] font-semibold text-[var(--color-positive)]">
                    Take ready
                  </span>
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <audio src={take.url} controls className="h-9 min-w-0 flex-1" />
                </div>
                <div className="flex items-center gap-2">
                  <a href={take.url} download={downloadName}>
                    <Button variant="primary" size="md">
                      <Download className="h-4 w-4" /> Download MP3
                    </Button>
                  </a>
                  <Button variant="secondary" size="md" onClick={startRecording}>
                    <RotateCcw className="h-4 w-4" /> Re-record
                  </Button>
                  <Button variant="ghost" size="icon" onClick={discard} aria-label="Discard take">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {error && (
          <p className="mt-3 text-sm text-[var(--color-danger)]" role="alert">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
