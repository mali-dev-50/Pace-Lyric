"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Download,
  Headphones,
  Loader2,
  Mic,
  Pause,
  Play,
  RotateCcw,
  Square,
  Trash2,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { KaraokeRecorder, prepareTrack, type Take } from "@/lib/recorder";
import { clamp, formatTimecode } from "@/lib/time";
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
    pause();
    try {
      const buffer = await prepareTrack(audioUrl);
      const rec = new KaraokeRecorder();
      recorderRef.current = rec;
      await rec.start(buffer, {
        startAt: 0,
        onTick: (t) => {
          setElapsed(t);
          setCurrentTime(t);
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
      {/* karaoke guide — fills the stage */}
      <div className="flex min-h-0 flex-1 flex-col">
        <KaraokePreview
          idleMessage={
            phase === "recording"
              ? "Sing along — your lyrics appear here in time."
              : "Put on headphones, then record your take. Lyrics will guide you here."
          }
        />
      </div>

      {/* record console */}
      <section className="shrink-0 rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-4">
        <div className="mb-3 flex items-center justify-center gap-1.5 text-center text-xs text-[var(--color-ink-subtle)]">
          <Headphones className="h-3.5 w-3.5 shrink-0 text-[var(--color-accent)]" />
          Use headphones — your mic is mixed with the track into a single MP3.
        </div>

        <div className="flex min-h-[52px] items-center justify-center">
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
            <div className="flex items-center gap-5">
              <div className="flex items-center gap-2.5 font-mono text-lg tabular-nums text-[var(--color-ink)]">
                <span className="relative flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-danger)] opacity-60" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-[var(--color-danger)]" />
                </span>
                {formatTimecode(elapsed)}
              </div>
              <Button
                variant="danger"
                size="lg"
                onClick={() => void finish()}
                className="border-[var(--color-danger)] bg-[color-mix(in_srgb,var(--color-danger)_16%,transparent)] text-[var(--color-ink)]"
              >
                <Square className="h-4 w-4 fill-[var(--color-danger)] text-[var(--color-danger)]" /> Stop
              </Button>
            </div>
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
                className="flex w-full max-w-3xl flex-wrap items-center justify-center gap-3"
              >
                <TakePlayer url={take.url} />
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
          <p className="mt-3 text-center text-sm text-[var(--color-danger)]" role="alert">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}

/** Compact, design-consistent player for the recorded take. */
function TakePlayer({ url }: { url: string }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);

  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  };

  const seekTo = (clientX: number) => {
    const el = ref.current;
    const bar = barRef.current;
    if (!el || !bar || !dur) return;
    const rect = bar.getBoundingClientRect();
    el.currentTime = clamp((clientX - rect.left) / rect.width, 0, 1) * dur;
  };

  const pct = dur ? (cur / dur) * 100 : 0;

  return (
    <div className="flex min-w-[260px] flex-1 items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-bg)] px-3 py-2">
      <span className="shrink-0 rounded-[var(--radius-xs)] bg-[color-mix(in_srgb,var(--color-positive)_16%,transparent)] px-2 py-1 text-[11px] font-semibold text-[var(--color-positive)]">
        Take ready
      </span>
      <button
        onClick={toggle}
        aria-label={playing ? "Pause take" : "Play take"}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] text-[var(--color-accent-ink)] transition-colors hover:bg-[var(--color-accent-strong)]"
      >
        {playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 translate-x-[1px] fill-current" />}
      </button>
      <div
        ref={barRef}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          seekTo(e.clientX);
        }}
        onPointerMove={(e) => e.buttons === 1 && seekTo(e.clientX)}
        className="group relative h-1.5 flex-1 cursor-pointer rounded-full bg-[var(--color-line-strong)]"
      >
        <div className="absolute inset-y-0 left-0 rounded-full bg-[var(--color-accent)]" style={{ width: `${pct}%` }} />
        <div
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-0 shadow-[var(--shadow-sm)] transition-opacity group-hover:opacity-100"
          style={{ left: `${pct}%` }}
        />
      </div>
      <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--color-ink-muted)]">
        {formatTimecode(cur)} / {formatTimecode(dur)}
      </span>
      <audio
        ref={ref}
        src={url}
        className="hidden"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          setDur(Number.isFinite(d) ? d : 0);
        }}
        onTimeUpdate={(e) => setCur(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
    </div>
  );
}
