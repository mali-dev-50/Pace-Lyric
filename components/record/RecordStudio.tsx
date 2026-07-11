"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  Download,
  Headphones,
  ListMusic,
  Loader2,
  Mic,
  MoreVertical,
  Music,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  Save,
  Square,
  Trash2,
} from "lucide-react";
import { useStore } from "@/lib/store";
import {
  KaraokeRecorder,
  StemPlayer,
  decodeVoiceStem,
  prepareTrack,
  renderMixToMp3,
  renderVoiceToMp3,
  voiceStemToWav,
  type VoiceStem,
} from "@/lib/recorder";
import { loadTakeBlob, saveTakeBlob } from "@/lib/storage";
import { hydrateTakeAudio, uploadTakeAudio } from "@/lib/cloud";
import { uid } from "@/lib/model";
import { clamp, formatTimecode } from "@/lib/time";
import type { RecordedTake } from "@/lib/types";
import { Button } from "../ui/Button";
import { Menu } from "../ui/Menu";
import { Modal } from "../ui/Modal";
import { KaraokePreview } from "../preview/KaraokePreview";

type Phase = "idle" | "preparing" | "recording" | "done";
type ExportMode = "mix" | "voice";

const sanitize = (s: string) => s.replace(/[^\w\-]+/g, "_").replace(/^_+|_+$/g, "") || "take";

export function RecordStudio() {
  const audioUrl = useStore((s) => s.audioUrl);
  const projectName = useStore((s) => s.project?.name ?? "take");
  const projectId = useStore((s) => s.project?.id ?? null);
  const takes = useStore((s) => s.project?.takes ?? []);
  const pushToCloud = useStore((s) => s.pushToCloud);
  const pause = useStore((s) => s.pause);
  const seek = useStore((s) => s.seek);
  const setCurrentTime = useStore((s) => s.setCurrentTime);
  const updateSettings = useStore((s) => s.updateSettings);
  const addTake = useStore((s) => s.addTake);
  const renameTake = useStore((s) => s.renameTake);
  const deleteTake = useStore((s) => s.deleteTake);

  const recorderRef = useRef<KaraokeRecorder | null>(null);
  const stemRef = useRef<StemPlayer | null>(null);
  const trackBufferRef = useRef<AudioBuffer | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [take, setTake] = useState<VoiceStem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);

  // review playback
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);

  // which take is loaded in review (null = a fresh, unsaved recording)
  const [activeTakeId, setActiveTakeId] = useState<string | null>(null);
  const [busyTakeId, setBusyTakeId] = useState<string | null>(null);

  // save / rename dialogs
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

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

  /** Wire a stem + backing track into a fresh review player. */
  const attachPlayer = useCallback(
    (stem: VoiceStem, mic: number, track: number) => {
      teardownStem();
      const trackBuf = trackBufferRef.current;
      if (!trackBuf) throw new Error("Backing track unavailable.");
      const player = new StemPlayer(stem, trackBuf, mic, track);
      player.onTick = (t) => {
        setPlayhead(t);
        setCurrentTime(t);
      };
      player.onEnded = () => setPlaying(false);
      stemRef.current = player;
      setPlayhead(0);
      setCurrentTime(0);
    },
    [teardownStem, setCurrentTime]
  );

  const finish = useCallback(() => {
    const rec = recorderRef.current;
    if (!rec || !rec.recording) return;
    try {
      const stem = rec.stop();
      attachPlayer(stem, micGain, trackGain);
      setTake(stem);
      setActiveTakeId(null);
      setPhase("done");
    } catch (err) {
      console.error("[recorder] stop failed:", err);
      setError(`Couldn't finish the recording. ${err instanceof Error ? err.message : ""}`);
      setPhase("idle");
    } finally {
      recorderRef.current = null;
    }
  }, [micGain, trackGain, attachPlayer]);

  const startRecording = useCallback(async () => {
    if (!audioUrl) return;
    setError(null);
    teardownStem();
    setTake(null);
    setActiveTakeId(null);
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

  /** Load a saved take into the review player so it can be heard and exported. */
  const loadTake = useCallback(
    async (t: RecordedTake) => {
      if (busyTakeId) return;
      setError(null);
      setBusyTakeId(t.id);
      pause();
      try {
        if (!trackBufferRef.current) {
          if (!audioUrl) throw new Error("Import the backing track first.");
          trackBufferRef.current = await prepareTrack(audioUrl);
        }
        const blob =
          (await loadTakeBlob(t.id)) ??
          (projectId ? await hydrateTakeAudio(projectId, t.id) : null);
        if (!blob) throw new Error("This take's audio couldn't be found.");
        const stem = await decodeVoiceStem(blob);
        setMicGainState(t.micGain);
        setTrackGainState(t.trackGain);
        attachPlayer(stem, t.micGain, t.trackGain);
        setTake(stem);
        setActiveTakeId(t.id);
        setPhase("done");
      } catch (err) {
        console.error("[recorder] load take failed:", err);
        setError(err instanceof Error ? err.message : "Couldn't load that take.");
      } finally {
        setBusyTakeId(null);
      }
    },
    [audioUrl, pause, attachPlayer, busyTakeId, projectId]
  );

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

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  /** Export whatever is currently in the review player. */
  const exportCurrent = async (mode: ExportMode) => {
    if (!take || !trackBufferRef.current) return;
    setRendering(true);
    try {
      const baseName = activeTakeId ? currentTakeName() : projectName;
      const blob =
        mode === "mix"
          ? await renderMixToMp3(take, trackBufferRef.current, micGain, trackGain)
          : await renderVoiceToMp3(take, micGain);
      const suffix = mode === "mix" ? "voice+music" : "voice";
      triggerDownload(blob, `${sanitize(baseName)}_${suffix}.mp3`);
    } catch (err) {
      console.error("[recorder] render failed:", err);
      setError("Couldn't render the MP3. Please try again.");
    } finally {
      setRendering(false);
    }
  };

  /** Export a saved take directly from its row (decodes on demand). */
  const exportTake = async (t: RecordedTake, mode: ExportMode) => {
    if (busyTakeId) return;
    setError(null);
    setBusyTakeId(t.id);
    try {
      if (!trackBufferRef.current) {
        if (!audioUrl) throw new Error("Import the backing track first.");
        trackBufferRef.current = await prepareTrack(audioUrl);
      }
      const blob = await loadTakeBlob(t.id);
      if (!blob) throw new Error("This take's audio couldn't be found.");
      const stem = await decodeVoiceStem(blob);
      const out =
        mode === "mix"
          ? await renderMixToMp3(stem, trackBufferRef.current, t.micGain, t.trackGain)
          : await renderVoiceToMp3(stem, t.micGain);
      const suffix = mode === "mix" ? "voice+music" : "voice";
      triggerDownload(out, `${sanitize(t.name)}_${suffix}.mp3`);
    } catch (err) {
      console.error("[recorder] export take failed:", err);
      setError(err instanceof Error ? err.message : "Couldn't export that take.");
    } finally {
      setBusyTakeId(null);
    }
  };

  const currentTakeName = () => takes.find((t) => t.id === activeTakeId)?.name ?? projectName;

  const openSaveDialog = () => {
    setSaveName(`Take ${takes.length + 1}`);
    setSaveOpen(true);
  };

  const confirmSave = async () => {
    if (!take) return;
    const id = uid("take");
    const name = saveName.trim() || `Take ${takes.length + 1}`;
    setSaving(true);
    try {
      const wav = voiceStemToWav(take);
      await saveTakeBlob(id, wav);
      addTake({
        id,
        name,
        createdAt: Date.now(),
        duration: take.duration,
        sampleRate: take.sampleRate,
        micGain,
        trackGain,
      });
      setActiveTakeId(id);
      setSaveOpen(false);
      // Sync to the cloud so a collaborator can hear this take too.
      if (projectId) {
        void uploadTakeAudio(projectId, id, wav);
        void pushToCloud();
      }
    } catch (err) {
      console.error("[recorder] save take failed:", err);
      setError("Couldn't save the take. Your browser storage may be full.");
    } finally {
      setSaving(false);
    }
  };

  const confirmRename = () => {
    if (renameId) renameTake(renameId, renameValue);
    setRenameId(null);
  };

  const removeTake = (t: RecordedTake) => {
    if (activeTakeId === t.id) {
      teardownStem();
      setTake(null);
      setActiveTakeId(null);
      if (phase === "done") setPhase("idle");
    }
    deleteTake(t.id);
  };

  const discard = () => {
    teardownStem();
    setTake(null);
    setActiveTakeId(null);
    setPhase("idle");
    setElapsed(0);
    seek(0);
  };

  const dur = stemRef.current?.duration ?? take?.duration ?? 0;
  const isSaved = activeTakeId != null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* karaoke guide — fills the stage */}
      <div className="flex min-h-0 flex-1 flex-col">
        <KaraokePreview
          idleMessage={
            phase === "recording"
              ? "Sing along — your lyrics appear here in time."
              : phase === "done"
                ? "Play your take to review it, then save, rebalance, or export."
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

        {/* saved takes */}
        {takes.length > 0 && (
          <SavedTakes
            takes={takes}
            activeTakeId={activeTakeId}
            busyTakeId={busyTakeId}
            onPlay={loadTake}
            onExport={exportTake}
            onRename={(t) => {
              setRenameId(t.id);
              setRenameValue(t.name);
            }}
            onDelete={removeTake}
          />
        )}

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
              ? "Rebalance freely — playback and export update instantly."
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
                  saved={isSaved}
                  label={isSaved ? currentTakeName() : "New take"}
                  onToggle={togglePlay}
                  onSeek={(t) => {
                    stemRef.current?.seek(t);
                    setPlayhead(t);
                  }}
                />
                <div className="flex items-center gap-2">
                  {!isSaved && (
                    <Button variant="secondary" size="md" onClick={openSaveDialog}>
                      <Save className="h-4 w-4" /> Save take
                    </Button>
                  )}
                  <DownloadMenu rendering={rendering} onExport={exportCurrent} />
                  <Button variant="secondary" size="md" onClick={startRecording}>
                    <RotateCcw className="h-4 w-4" /> Re-record
                  </Button>
                  <Button variant="ghost" size="icon" onClick={discard} aria-label="Close take">
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

      {/* name-on-save dialog */}
      <Modal
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        title="Save take"
        description="Name this recording so you can find, play, and export it later."
        footer={
          <>
            <Button variant="ghost" size="md" onClick={() => setSaveOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" size="md" onClick={confirmSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save take
            </Button>
          </>
        }
      >
        <TextField
          label="Take name"
          value={saveName}
          onChange={setSaveName}
          onEnter={confirmSave}
          autoFocus
        />
      </Modal>

      {/* rename dialog */}
      <Modal
        open={renameId != null}
        onClose={() => setRenameId(null)}
        title="Rename take"
        footer={
          <>
            <Button variant="ghost" size="md" onClick={() => setRenameId(null)}>
              Cancel
            </Button>
            <Button variant="primary" size="md" onClick={confirmRename}>
              Save
            </Button>
          </>
        }
      >
        <TextField
          label="Take name"
          value={renameValue}
          onChange={setRenameValue}
          onEnter={confirmRename}
          autoFocus
        />
      </Modal>
    </div>
  );
}

/** The list of saved takes, each with play + export + rename + delete. */
function SavedTakes({
  takes,
  activeTakeId,
  busyTakeId,
  onPlay,
  onExport,
  onRename,
  onDelete,
}: {
  takes: RecordedTake[];
  activeTakeId: string | null;
  busyTakeId: string | null;
  onPlay: (t: RecordedTake) => void;
  onExport: (t: RecordedTake, mode: ExportMode) => void;
  onRename: (t: RecordedTake) => void;
  onDelete: (t: RecordedTake) => void;
}) {
  return (
    <div className="mx-auto mb-4 w-full max-w-2xl">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-subtle)]">
        <ListMusic className="h-3.5 w-3.5" />
        Saved takes ({takes.length})
      </div>
      <ul className="max-h-40 space-y-1 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-bg)] p-1">
        {takes.map((t) => {
          const active = t.id === activeTakeId;
          const busy = t.id === busyTakeId;
          return (
            <li
              key={t.id}
              className={
                "flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 transition-colors " +
                (active ? "bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)]" : "hover:bg-[var(--color-surface-2)]")
              }
            >
              <button
                onClick={() => onPlay(t)}
                disabled={busy}
                aria-label={`Play ${t.name}`}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] text-[var(--color-accent-ink)] transition-colors hover:bg-[var(--color-accent-strong)] disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5 translate-x-[1px] fill-current" />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-[var(--color-ink)]">{t.name}</div>
                <div className="font-mono text-[11px] tabular-nums text-[var(--color-ink-subtle)]">
                  {formatTimecode(t.duration)}
                </div>
              </div>
              {active && (
                <span className="shrink-0 rounded-[var(--radius-xs)] bg-[color-mix(in_srgb,var(--color-accent)_18%,transparent)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-accent)]">
                  In review
                </span>
              )}
              <Menu
                align="right"
                trigger={
                  <span className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-xs)] text-[var(--color-ink-subtle)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]">
                    <MoreVertical className="h-4 w-4" />
                  </span>
                }
                items={[
                  { label: "Play in review", icon: <Play className="h-4 w-4" />, onClick: () => onPlay(t) },
                  "divider",
                  {
                    label: "Download voice + music",
                    icon: <Music className="h-4 w-4" />,
                    onClick: () => onExport(t, "mix"),
                  },
                  {
                    label: "Download voice only",
                    icon: <Mic className="h-4 w-4" />,
                    onClick: () => onExport(t, "voice"),
                  },
                  "divider",
                  { label: "Rename", icon: <Pencil className="h-4 w-4" />, onClick: () => onRename(t) },
                  {
                    label: "Delete take",
                    icon: <Trash2 className="h-4 w-4" />,
                    danger: true,
                    onClick: () => onDelete(t),
                  },
                ]}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Primary "Download" split-button offering the two export flavours. */
function DownloadMenu({
  rendering,
  onExport,
}: {
  rendering: boolean;
  onExport: (mode: ExportMode) => void;
}) {
  return (
    <Menu
      align="right"
      trigger={
        <span
          className={
            "inline-flex h-10 items-center justify-center gap-2 rounded-[var(--radius-sm)] px-4 text-sm font-semibold " +
            "bg-[var(--color-accent)] text-[var(--color-accent-ink)] shadow-[var(--shadow-sm)] transition-colors hover:bg-[var(--color-accent-strong)]"
          }
        >
          {rendering ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Rendering…
            </>
          ) : (
            <>
              <Download className="h-4 w-4" /> Download <ChevronDown className="h-3.5 w-3.5 opacity-80" />
            </>
          )}
        </span>
      }
      items={[
        {
          label: "Voice + Music (.mp3)",
          icon: <Music className="h-4 w-4" />,
          disabled: rendering,
          onClick: () => onExport("mix"),
        },
        {
          label: "Voice only (.mp3)",
          icon: <Mic className="h-4 w-4" />,
          disabled: rendering,
          onClick: () => onExport("voice"),
        },
      ]}
    />
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

/** A labelled text input used by the save / rename dialogs. */
function TextField({
  label,
  value,
  onChange,
  onEnter,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onEnter?: () => void;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-[var(--color-ink-muted)]">{label}</span>
      <input
        type="text"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onEnter?.();
          }
        }}
        className="w-full rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
      />
    </label>
  );
}

/** Playback transport for the take currently in review (driven by StemPlayer). */
function TakePlayer({
  playing,
  current,
  duration,
  saved,
  label,
  onToggle,
  onSeek,
}: {
  playing: boolean;
  current: number;
  duration: number;
  saved: boolean;
  label: string;
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
      <span
        className={
          "shrink-0 max-w-[140px] truncate rounded-[var(--radius-xs)] px-2 py-1 text-[11px] font-semibold " +
          (saved
            ? "bg-[color-mix(in_srgb,var(--color-accent)_16%,transparent)] text-[var(--color-accent)]"
            : "bg-[color-mix(in_srgb,var(--color-positive)_16%,transparent)] text-[var(--color-positive)]")
        }
        title={label}
      >
        {label}
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
