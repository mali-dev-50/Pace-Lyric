"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Download,
  Headphones,
  Loader2,
  Mic,
  Music,
  Pause,
  Play,
  RotateCcw,
  Square,
  Trash2,
} from "lucide-react";
import { useStore } from "@/lib/store";
import {
  KaraokeRecorder,
  StemPlayer,
  prepareTrack,
  renderMixToMp3,
  type VoiceStem,
} from "@/lib/recorder";
import { clamp, formatTimecode } from "@/lib/time";
import { Button } from "../ui/Button";
import { KaraokePreview } from "../preview/KaraokePreview";

type Phase = "idle" | "preparing" | "recording" | "done";

export function RecordStudio() {
  const audioUrl = useStore((s) => s.audioUrl);
  const projectName = useStore((s) => s.project?.name ?? "take");
  const pause = useStore((s) => s.pause);
  const seek = useStore((s) => s.seek);
  const setCurrentTime = useStore((s) => s.setCurrentTime);
  const updateSettings = useStore((s) => s.updateSettings);

  const recorderRef = useRef<KaraokeRecorder | null>(null);
  const stemRef = useRef<StemPlayer | null>(null);
  const trackBufferRef = useRef<AudioBuffer | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [take, setTake] = useState<VoiceStem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);

  // take playback
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);

  // mixer levels — persisted, adjustable live before/during/after a take
  const [micGain, setMicGainState] = useState(
    () => useStore.getState().project?.settings.micGain ?? 1
  );
  const [trackGain, setTrackGainState] = useState(
    () => useStore.getState().project?.settings.trackGain ?? 1
  );
  const persistRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<{ micGain?: number; trackGain?: number }>({});

  const persistGains = useCallback(
    (patch: { micGain?: number; trackGain?: number }) => {
      pendingRef.current = { ...pendingRef.current, ...patch };
      if (persistRef.current) clearTimeout(persistRef.current);
      persistRef.current = setTimeout(() => {
        updateSettings(pendingRef.current);
        pendingRef.current = {};
      }, 350);
    },
    [updateSettings]
  );

  const changeMic = (v: number) => {
    setMicGainState(v);
    stemRef.current?.setVoiceGain(v);
    persistGains({ micGain: v });
  };
  const changeTrack = (v: number) => {
    setTrackGainState(v);
    recorderRef.current?.setTrackGain(v);
    stemRef.current?.setTrackGain(v);
    persistGains({ trackGain: v });
  };

  const teardownStem = useCallback(() => {
    stemRef.current?.dispose();
    stemRef.current = null;
    setPlaying(false);
    setPlayhead(0);
  }, []);

  useEffect(() => () => teardownStem(), [teardownStem]);

  const finish = useCallback(() => {
    const rec = recorderRef.current;
    if (!rec || !rec.recording) return;
    try {
      const stem = rec.stop();
      const track = trackBufferRef.current;
      if (!track) throw new Error("Backing track unavailable.");
      const player = new StemPlayer(stem, track, micGain, trackGain);
      player.onTick = (t) => {
        setPlayhead(t);
        setCurrentTime(t);
      };
      player.onEnded = () => setPlaying(false);
      stemRef.current = player;
      setTake(stem);
      setPhase("done");
      setPlayhead(0);
      setCurrentTime(0);
    } catch (err) {
      console.error("[recorder] stop failed:", err);
      setError(`Couldn't finish the recording. ${err instanceof Error ? err.message : ""}`);
      setPhase("idle");
    } finally {
      recorderRef.current = null;
    }
  }, [micGain, trackGain, setCurrentTime]);

  const startRecording = useCallback(async () => {
    if (!audioUrl) return;
    setError(null);
    teardownStem();
    setTake(null);
    setPhase("preparing");
    pause();
    try {
      const buffer = await prepareTrack(audioUrl);
      trackBufferRef.current = buffer;
      const rec = new KaraokeRecorder();
      recorderRef.current = rec;
      await rec.start(buffer, {
        trackGain,
        onTick: (t) => {
          setElapsed(t);
          setCurrentTime(t);
        },
        onComplete: () => finish(),
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
  }, [audioUrl, pause, setCurrentTime, finish, trackGain, teardownStem]);

  const togglePlay = () => {
    const p = stemRef.current;
    if (!p) return;
    if (p.playing) {
      p.pause();
      setPlaying(false);
    } else {
      void p.play();
      setPlaying(true);
    }
  };

  const download = async () => {
    if (!take || !trackBufferRef.current) return;
    setRendering(true);
    try {
      const blob = await renderMixToMp3(take, trackBufferRef.current, micGain, trackGain);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${projectName.replace(/[^\w\-]+/g, "_")}_take.mp3`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[recorder] render failed:", err);
      setError("Couldn't render the MP3. Please try again.");
    } finally {
      setRendering(false);
    }
  };

  const discard = () => {
    teardownStem();
    setTake(null);
    setPhase("idle");
    setElapsed(0);
    seek(0);
  };

  const dur = stemRef.current?.duration ?? take?.duration ?? 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* karaoke guide — fills the stage */}
      <div className="flex min-h-0 flex-1 flex-col">
        <KaraokePreview
          idleMessage={
            phase === "recording"
              ? "Sing along — your lyrics appear here in time."
              : phase === "done"
                ? "Play your take to review it, then rebalance and download."
                : "Put on headphones, then record your take. Lyrics will guide you here."
          }
        />
      </div>

      {/* record console */}
      <section className="shrink-0 rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-4">
        <div className="mb-3 flex items-center justify-center gap-1.5 text-center text-xs text-[var(--color-ink-subtle)]">
          <Headphones className="h-3.5 w-3.5 shrink-0 text-[var(--color-accent)]" />
          Use headphones — your mic is recorded separately and mixed with the track.
        </div>

        {/* mixer */}
        {phase !== "preparing" && (
          <div className="mb-2 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            <Level icon={<Mic className="h-3.5 w-3.5" />} label="Your voice" value={micGain} onChange={changeMic} />
            <Level icon={<Music className="h-3.5 w-3.5" />} label="Music" value={trackGain} onChange={changeTrack} />
          </div>
        )}
        {phase !== "preparing" && (
          <p className="mb-4 text-center text-[11px] text-[var(--color-ink-subtle)]">
            {phase === "done"
              ? "Rebalance freely — playback and download update instantly."
              : phase === "recording"
                ? "“Music” is your monitor level; you can perfect the balance after the take."
                : "Set a starting balance — you can adjust it after recording too."}
          </p>
        )}

        <div className="flex min-h-[52px] items-center justify-center border-t border-[var(--color-line)] pt-4">
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
                onClick={finish}
                className="border-[var(--color-danger)] bg-[color-mix(in_srgb,var(--color-danger)_16%,transparent)] text-[var(--color-ink)]"
              >
                <Square className="h-4 w-4 fill-[var(--color-danger)] text-[var(--color-danger)]" /> Stop
              </Button>
            </div>
          )}

          <AnimatePresence>
            {phase === "done" && take && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex w-full max-w-3xl flex-wrap items-center justify-center gap-3"
              >
                <TakePlayer
                  playing={playing}
                  current={playhead}
                  duration={dur}
                  onToggle={togglePlay}
                  onSeek={(t) => {
                    stemRef.current?.seek(t);
                    setPlayhead(t);
                  }}
                />
                <div className="flex items-center gap-2">
                  <Button variant="primary" size="md" onClick={download} disabled={rendering}>
                    {rendering ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Rendering…
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4" /> Download MP3
                      </>
                    )}
                  </Button>
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

/** One labelled level fader for the record mixer. */
function Level({
  icon,
  label,
  value,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex w-[92px] shrink-0 items-center gap-1.5 text-xs font-medium text-[var(--color-ink-muted)]">
        <span className="text-[var(--color-accent)]">{icon}</span>
        {label}
      </span>
      <input
        type="range"
        min={0}
        max={1.5}
        step={0.05}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        aria-label={`${label} level`}
        className="h-1.5 w-36 cursor-pointer appearance-none rounded-full bg-[var(--color-line-strong)] accent-[var(--color-accent)]"
      />
      <span className="w-10 text-right font-mono text-xs tabular-nums text-[var(--color-ink-subtle)]">
        {Math.round(value * 100)}%
      </span>
    </div>
  );
}

/** Playback transport for the recorded take (driven by the StemPlayer). */
function TakePlayer({
  playing,
  current,
  duration,
  onToggle,
  onSeek,
}: {
  playing: boolean;
  current: number;
  duration: number;
  onToggle: () => void;
  onSeek: (t: number) => void;
}) {
  const barRef = useRef<HTMLDivElement | null>(null);
  const seekTo = (clientX: number) => {
    const bar = barRef.current;
    if (!bar || !duration) return;
    const rect = bar.getBoundingClientRect();
    onSeek(clamp((clientX - rect.left) / rect.width, 0, 1) * duration);
  };
  const pct = duration ? (current / duration) * 100 : 0;

  return (
    <div className="flex min-w-[260px] flex-1 items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-bg)] px-3 py-2">
      <span className="shrink-0 rounded-[var(--radius-xs)] bg-[color-mix(in_srgb,var(--color-positive)_16%,transparent)] px-2 py-1 text-[11px] font-semibold text-[var(--color-positive)]">
        Take ready
      </span>
      <button
        onClick={onToggle}
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
        {formatTimecode(current)} / {formatTimecode(duration)}
      </span>
    </div>
  );
}
