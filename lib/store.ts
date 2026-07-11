import { create } from "zustand";
import { audioBus } from "./audioBus";
import { downloadLrc, downloadProjectJson } from "./lrc";
import {
  createLine,
  effectiveEnd,
  effectiveStart,
  flatWordAt,
  lineText,
  parseLyrics,
  round2,
  snapTime,
  tokenize,
  uid,
} from "./model";
import { duplicateProject, getProject, putProject, renameProject } from "./projects";
import { deleteTakeBlob, loadAudioBlob, saveAudioBlob } from "./storage";
import {
  deleteTakeAudio,
  hydrateSourceAudio,
  saveCloudProject,
  uploadSourceAudio,
  type SaveResult,
} from "./cloud";
import { clamp } from "./time";
import type {
  Flag,
  KaraokeProject,
  Line,
  ProjectSettings,
  RecordedTake,
  TimingLevel,
  Word,
} from "./types";
import { extractPeaks } from "./waveform";

type View = "editor" | "preview" | "record";

interface StoreState {
  project: KaraokeProject | null;
  loaded: boolean;

  audioUrl: string | null;
  hasAudio: boolean;
  peaks: number[];
  audioLoading: boolean;

  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  volume: number;

  view: View;
  selectedLineId: string | null;
  selectedFlagId: string | null;

  syncMode: boolean;
  syncLevel: TimingLevel;
  cursor: number;

  // ---- lifecycle ----
  openProject: (id: string) => Promise<boolean>;
  closeProject: () => void;
  save: () => void;
  saveAs: (name: string) => Promise<string | null>;
  rename: (name: string) => void;

  // ---- meta ----
  setName: (v: string) => void;
  setTitle: (v: string) => void;
  setArtist: (v: string) => void;
  updateSettings: (patch: Partial<ProjectSettings>) => void;

  // ---- audio ----
  attachAudio: (blob: Blob, fileName: string, persist?: boolean) => Promise<void>;
  setPeaks: (peaks: number[]) => void;
  setDuration: (d: number) => void;

  // ---- lyrics ----
  setLyricsFromText: (block: string) => void;
  addLine: (text?: string) => void;
  updateLineText: (lineId: string, text: string) => void;
  deleteLine: (lineId: string) => void;
  moveLine: (lineId: string, dir: -1 | 1) => void;
  selectLine: (lineId: string | null) => void;

  // ---- timing ----
  setLineTime: (lineId: string, field: "start" | "end", value: number | null) => void;
  /** In-memory only (no persistence) — for smooth drag interactions. */
  setLineTimeLive: (lineId: string, field: "start" | "end", value: number | null) => void;
  setLineDuration: (lineId: string, seconds: number) => void;
  setWordTime: (lineId: string, wordId: string, field: "start" | "end", value: number | null) => void;
  stampLineStart: (lineId: string) => void;
  stampLineEnd: (lineId: string) => void;
  clearLineTiming: (lineId: string) => void;
  clearAllTiming: () => void;
  shiftAllTiming: (deltaSeconds: number) => void;
  snapLineEdgeToNearestFlag: (lineId: string, edge: "start" | "end") => void;

  // ---- flags ----
  addFlag: (time?: number, label?: string) => void;
  updateFlagTime: (id: string, time: number) => void;
  /** In-memory only (no persistence) — for smooth flag dragging. */
  updateFlagTimeLive: (id: string, time: number) => void;
  updateFlagLabel: (id: string, label: string) => void;
  deleteFlag: (id: string) => void;
  selectFlag: (id: string | null) => void;

  // ---- recorded takes ----
  /** Register a saved take's metadata (its audio blob is stored separately). */
  addTake: (take: RecordedTake) => void;
  renameTake: (id: string, name: string) => void;
  deleteTake: (id: string) => void;

  /** Push the current project (metadata + JSON) to the cloud, if configured. */
  pushToCloud: () => Promise<SaveResult>;

  /** Persist the current in-memory project (call after a live drag ends). */
  persistProject: () => void;

  // ---- playback ----
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seek: (t: number) => void;
  seekBy: (delta: number) => void;
  setPlaying: (v: boolean) => void;
  setCurrentTime: (t: number) => void;
  setRate: (r: number) => void;
  setVolume: (v: number) => void;

  // ---- view + sync ----
  setView: (v: View) => void;
  startSync: (level: TimingLevel) => void;
  stopSync: () => void;
  tap: () => void;
  undoTap: () => void;

  // ---- export ----
  exportLrc: () => void;
  exportJson: () => void;
}

/** Clone → mutate → persist. Immutable updates + auto-save to the registry. */
function commit(
  set: (fn: (s: StoreState) => Partial<StoreState>) => void,
  get: () => StoreState,
  mutator: (draft: KaraokeProject) => void
) {
  const current = get().project;
  if (!current) return;
  const draft = structuredClone(current);
  mutator(draft);
  draft.updatedAt = Date.now();
  putProject(draft);
  set(() => ({ project: draft }));
}

function flatWords(lines: Line[]): Array<{ l: number; w: number }> {
  const out: Array<{ l: number; w: number }> = [];
  lines.forEach((line, l) => line.words.forEach((_, w) => out.push({ l, w })));
  return out;
}

/** Snap points for line-edge dragging: all flags + every other line boundary. */
function snapPoints(project: KaraokeProject, exceptLineId: string): number[] {
  const pts: number[] = project.flags.map((f) => f.time);
  project.lines.forEach((l) => {
    if (l.id === exceptLineId) return;
    const s = effectiveStart(l);
    const e = effectiveEnd(l);
    if (s != null) pts.push(s);
    if (e != null) pts.push(e);
  });
  return pts;
}

export const useStore = create<StoreState>((set, get) => ({
  project: null,
  loaded: false,

  audioUrl: null,
  hasAudio: false,
  peaks: [],
  audioLoading: false,

  isPlaying: false,
  currentTime: 0,
  duration: 0,
  playbackRate: 1,
  volume: 1,

  view: "editor",
  selectedLineId: null,
  selectedFlagId: null,

  syncMode: false,
  syncLevel: "line",
  cursor: 0,

  openProject: async (id) => {
    const project = getProject(id);
    if (!project) return false;
    // reset audio + playback for the newly opened project
    const prevUrl = get().audioUrl;
    if (prevUrl) URL.revokeObjectURL(prevUrl);
    set(() => ({
      project,
      loaded: true,
      audioUrl: null,
      hasAudio: false,
      peaks: [],
      audioLoading: !!project.audioFileName,
      isPlaying: false,
      currentTime: 0,
      duration: project.audioDuration ?? 0,
      playbackRate: 1,
      view: "editor",
      selectedLineId: project.lines[0]?.id ?? null,
      selectedFlagId: null,
      syncMode: false,
      cursor: 0,
    }));

    if (project.audioFileName) {
      // Prefer the local cache; fall back to the cloud (a collaborator's first
      // open, or a fresh browser) and re-cache it.
      const blob = (await loadAudioBlob(id)) ?? (await hydrateSourceAudio(id));
      if (blob && get().project?.id === id) {
        const url = URL.createObjectURL(blob);
        set(() => ({ audioUrl: url, hasAudio: true }));
        try {
          const peaks = await extractPeaks(blob);
          if (get().project?.id === id) set(() => ({ peaks, audioLoading: false }));
        } catch {
          set(() => ({ audioLoading: false }));
        }
      } else {
        set(() => ({ audioLoading: false }));
      }
    }
    return true;
  },

  closeProject: () => {
    const url = get().audioUrl;
    if (url) URL.revokeObjectURL(url);
    audioBus.el?.pause();
    set(() => ({
      project: null,
      loaded: false,
      audioUrl: null,
      hasAudio: false,
      peaks: [],
      isPlaying: false,
      currentTime: 0,
      duration: 0,
    }));
  },

  save: () => {
    const p = get().project;
    if (p) putProject(p);
  },

  saveAs: async (name) => {
    const p = get().project;
    if (!p) return null;
    // persist current, then duplicate it under the new name.
    putProject(p);
    const copy = await duplicateProject(p.id);
    if (!copy) return null;
    copy.name = name.trim() || copy.name;
    putProject(copy);
    return copy.id;
  },

  rename: (name) => {
    const p = get().project;
    if (!p) return;
    renameProject(p.id, name);
    commit(set, get, (d) => void (d.name = name.trim() || d.name));
  },

  setName: (v) => commit(set, get, (d) => void (d.name = v)),
  setTitle: (v) => commit(set, get, (d) => void (d.title = v)),
  setArtist: (v) => commit(set, get, (d) => void (d.artist = v)),
  updateSettings: (patch) =>
    commit(set, get, (d) => void (d.settings = { ...d.settings, ...patch })),

  attachAudio: async (blob, fileName, persist = true) => {
    const id = get().project?.id;
    if (!id) return;
    set(() => ({ audioLoading: true }));
    const prev = get().audioUrl;
    if (prev) URL.revokeObjectURL(prev);
    const url = URL.createObjectURL(blob);
    set(() => ({ audioUrl: url, hasAudio: true }));
    commit(set, get, (d) => void (d.audioFileName = fileName));
    if (persist) {
      await saveAudioBlob(id, blob);
      void uploadSourceAudio(id, blob);
    }
  },

  setPeaks: (peaks) => set(() => ({ peaks, audioLoading: false })),
  setDuration: (d) => {
    set(() => ({ duration: d }));
    commit(set, get, (draft) => void (draft.audioDuration = d));
  },

  setLyricsFromText: (block) =>
    commit(set, get, (d) => {
      const existing = new Map(d.lines.map((l) => [lineText(l).toLowerCase(), l]));
      const parsed = parseLyrics(block);
      d.lines = parsed.map((line) => {
        const match = existing.get(lineText(line).toLowerCase());
        return match ? structuredClone(match) : line;
      });
    }),

  addLine: (text = "") =>
    commit(set, get, (d) => {
      d.lines.push(createLine(text || "New line"));
    }),

  updateLineText: (lineId, text) =>
    commit(set, get, (d) => {
      const line = d.lines.find((l) => l.id === lineId);
      if (!line) return;
      const newTokens = tokenize(text);
      const old = line.words;
      line.words = newTokens.map((tok, i): Word => {
        const prev = old[i];
        if (prev && prev.text === tok) return prev;
        return { id: uid("w"), text: tok, start: null, end: null };
      });
    }),

  deleteLine: (lineId) => {
    commit(set, get, (d) => {
      d.lines = d.lines.filter((l) => l.id !== lineId);
    });
    if (get().selectedLineId === lineId) set(() => ({ selectedLineId: null }));
  },

  moveLine: (lineId, dir) =>
    commit(set, get, (d) => {
      const i = d.lines.findIndex((l) => l.id === lineId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= d.lines.length) return;
      [d.lines[i], d.lines[j]] = [d.lines[j], d.lines[i]];
    }),

  selectLine: (lineId) => set(() => ({ selectedLineId: lineId, selectedFlagId: null })),

  setLineTime: (lineId, field, value) =>
    commit(set, get, (d) => {
      const line = d.lines.find((l) => l.id === lineId);
      if (line) line[field] = value == null ? null : round2(Math.max(0, value));
    }),

  setLineTimeLive: (lineId, field, value) => {
    const current = get().project;
    if (!current) return;
    const draft = structuredClone(current);
    const line = draft.lines.find((l) => l.id === lineId);
    if (line) line[field] = value == null ? null : round2(Math.max(0, value));
    set(() => ({ project: draft }));
  },

  setLineDuration: (lineId, seconds) =>
    commit(set, get, (d) => {
      const line = d.lines.find((l) => l.id === lineId);
      if (!line) return;
      const s = effectiveStart(line);
      if (s == null) return;
      line.start = round2(s);
      line.end = round2(s + Math.max(0, seconds));
    }),

  setWordTime: (lineId, wordId, field, value) =>
    commit(set, get, (d) => {
      const line = d.lines.find((l) => l.id === lineId);
      const word = line?.words.find((w) => w.id === wordId);
      if (word) word[field] = value == null ? null : round2(Math.max(0, value));
    }),

  stampLineStart: (lineId) =>
    commit(set, get, (d) => {
      const line = d.lines.find((l) => l.id === lineId);
      if (line) line.start = round2(get().currentTime);
    }),

  stampLineEnd: (lineId) =>
    commit(set, get, (d) => {
      const line = d.lines.find((l) => l.id === lineId);
      if (line) line.end = round2(get().currentTime);
    }),

  clearLineTiming: (lineId) =>
    commit(set, get, (d) => {
      const line = d.lines.find((l) => l.id === lineId);
      if (!line) return;
      line.start = null;
      line.end = null;
      line.words.forEach((w) => {
        w.start = null;
        w.end = null;
      });
    }),

  clearAllTiming: () =>
    commit(set, get, (d) => {
      d.lines.forEach((line) => {
        line.start = null;
        line.end = null;
        line.words.forEach((w) => {
          w.start = null;
          w.end = null;
        });
      });
    }),

  shiftAllTiming: (delta) =>
    commit(set, get, (d) => {
      const shift = (t: number | null) => (t == null ? null : Math.max(0, round2(t + delta)));
      d.lines.forEach((line) => {
        line.start = shift(line.start);
        line.end = shift(line.end);
        line.words.forEach((w) => {
          w.start = shift(w.start);
          w.end = shift(w.end);
        });
      });
      d.flags.forEach((f) => (f.time = Math.max(0, round2(f.time + delta))));
    }),

  snapLineEdgeToNearestFlag: (lineId, edge) =>
    commit(set, get, (d) => {
      const line = d.lines.find((l) => l.id === lineId);
      if (!line || d.flags.length === 0) return;
      const current = edge === "start" ? effectiveStart(line) : effectiveEnd(line);
      const base = current ?? get().currentTime;
      const snapped = snapTime(base, d.flags.map((f) => f.time), Infinity);
      line[edge] = round2(snapped);
    }),

  addFlag: (time, label = "") => {
    const t = round2(time ?? get().currentTime);
    let newId = "";
    commit(set, get, (d) => {
      newId = uid("flag");
      d.flags.push({ id: newId, time: t, label });
      d.flags.sort((a, b) => a.time - b.time);
    });
    set(() => ({ selectedFlagId: newId }));
  },

  updateFlagTime: (id, time) =>
    commit(set, get, (d) => {
      const flag = d.flags.find((f) => f.id === id);
      if (flag) flag.time = Math.max(0, round2(time));
    }),

  updateFlagTimeLive: (id, time) => {
    const current = get().project;
    if (!current) return;
    const draft = structuredClone(current);
    const flag = draft.flags.find((f) => f.id === id);
    if (flag) flag.time = Math.max(0, round2(time));
    set(() => ({ project: draft }));
  },

  updateFlagLabel: (id, label) =>
    commit(set, get, (d) => {
      const flag = d.flags.find((f) => f.id === id);
      if (flag) flag.label = label;
    }),

  addTake: (take) =>
    commit(set, get, (d) => {
      d.takes = [...(d.takes ?? []), take];
    }),

  renameTake: (id, name) =>
    commit(set, get, (d) => {
      const take = (d.takes ?? []).find((t) => t.id === id);
      if (take) take.name = name.trim() || take.name;
    }),

  deleteTake: (id) => {
    const projectId = get().project?.id;
    commit(set, get, (d) => {
      d.takes = (d.takes ?? []).filter((t) => t.id !== id);
    });
    void deleteTakeBlob(id);
    if (projectId) void deleteTakeAudio(projectId, id);
  },

  pushToCloud: async () => {
    const p = get().project;
    if (!p) return { ok: true };
    return saveCloudProject(p);
  },

  persistProject: () => {
    const p = get().project;
    if (!p) return;
    const draft = { ...p, updatedAt: Date.now() };
    putProject(draft);
    set(() => ({ project: draft }));
  },

  deleteFlag: (id) => {
    commit(set, get, (d) => {
      d.flags = d.flags.filter((f) => f.id !== id);
    });
    if (get().selectedFlagId === id) set(() => ({ selectedFlagId: null }));
  },

  selectFlag: (id) => set(() => ({ selectedFlagId: id })),

  // ---- playback ----
  play: () => {
    void audioBus.el?.play();
    set(() => ({ isPlaying: true }));
  },
  pause: () => {
    audioBus.el?.pause();
    set(() => ({ isPlaying: false }));
  },
  togglePlay: () => (get().isPlaying ? get().pause() : get().play()),
  seek: (t) => {
    const dur = get().duration || 0;
    const clamped = clamp(t, 0, dur > 0 ? dur : t);
    if (audioBus.el) audioBus.el.currentTime = clamped;
    set(() => ({ currentTime: clamped }));
  },
  seekBy: (delta) => get().seek(get().currentTime + delta),
  setPlaying: (v) => set(() => ({ isPlaying: v })),
  setCurrentTime: (t) => set(() => ({ currentTime: t })),
  setRate: (r) => {
    if (audioBus.el) audioBus.el.playbackRate = r;
    set(() => ({ playbackRate: r }));
  },
  setVolume: (v) => {
    if (audioBus.el) audioBus.el.volume = v;
    set(() => ({ volume: v }));
  },

  setView: (v) => set(() => ({ view: v })),

  startSync: (level) => {
    const lines = get().project?.lines ?? [];
    let cursor = 0;
    if (level === "line") {
      const idx = lines.findIndex((l) => effectiveStart(l) == null);
      cursor = idx === -1 ? lines.length : idx;
    } else {
      const flat = flatWords(lines);
      const idx = flat.findIndex(({ l, w }) => lines[l].words[w].start == null);
      cursor = idx === -1 ? flat.length : idx;
    }
    set(() => ({ syncMode: true, syncLevel: level, cursor }));
  },

  stopSync: () => set(() => ({ syncMode: false })),

  tap: () => {
    const state = get();
    if (!state.project) return;
    const t = round2(state.currentTime);
    const level = state.syncLevel;

    commit(set, get, (d) => {
      if (level === "line") {
        const i = state.cursor;
        if (i < 0 || i >= d.lines.length) return;
        d.lines[i].start = t;
        if (i > 0 && (d.lines[i - 1].end == null || d.lines[i - 1].end! < t)) {
          d.lines[i - 1].end = t;
        }
      } else {
        const flat = flatWords(d.lines);
        const i = state.cursor;
        if (i < 0 || i >= flat.length) return;
        const { l, w } = flat[i];
        d.lines[l].words[w].start = t;
        if (w === 0) d.lines[l].start = t;
        if (i > 0) {
          const prev = flat[i - 1];
          const pw = d.lines[prev.l].words[prev.w];
          if (pw.end == null || pw.end < t) pw.end = t;
          if (prev.l !== l && (d.lines[prev.l].end == null || d.lines[prev.l].end! < t)) {
            d.lines[prev.l].end = t;
          }
        }
      }
    });

    set((s) => ({ cursor: s.cursor + 1 }));
  },

  undoTap: () => {
    const state = get();
    if (!state.project) return;
    const level = state.syncLevel;
    const target = Math.max(0, state.cursor - 1);
    commit(set, get, (d) => {
      if (level === "line") {
        if (target < d.lines.length) {
          d.lines[target].start = null;
          if (target > 0) d.lines[target - 1].end = null;
        }
      } else {
        const flat = flatWords(d.lines);
        if (target < flat.length) {
          const { l, w } = flat[target];
          d.lines[l].words[w].start = null;
          if (w === 0) d.lines[l].start = null;
        }
      }
    });
    set(() => ({ cursor: target }));
  },

  exportLrc: () => {
    const p = get().project;
    if (p) downloadLrc(p, true);
  },
  exportJson: () => {
    const p = get().project;
    if (p) downloadProjectJson(p);
  },
}));

// Re-export helpers used by components for convenience.
export { effectiveStart, effectiveEnd, flatWordAt, snapPoints };
