import { DEFAULT_SETTINGS, type KaraokeProject, type Line, type ProjectSummary, type Word } from "./types";

/** Small unique id generator (no crypto dependency needed). */
let counter = 0;
export function uid(prefix = "id"): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`;
}

export function createWord(text: string): Word {
  return { id: uid("w"), text, start: null, end: null };
}

export function createLine(text: string): Line {
  const words = tokenize(text).map(createWord);
  return { id: uid("l"), words, start: null, end: null };
}

/** Split a line of text into word tokens, preserving nothing but the words. */
export function tokenize(text: string): string[] {
  return text
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

/** Turn a block of pasted lyrics into lines. Blank lines are dropped. */
export function parseLyrics(block: string): Line[] {
  return block
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map(createLine);
}

export function lineText(line: Line): string {
  return line.words.map((w) => w.text).join(" ");
}

/** Effective start of a line: explicit value, else earliest timed word. */
export function effectiveStart(line: Line): number | null {
  if (line.start != null) return line.start;
  const times = line.words.map((w) => w.start).filter((t): t is number => t != null);
  return times.length ? Math.min(...times) : null;
}

/** Effective end of a line: explicit value, else latest timed word. */
export function effectiveEnd(line: Line): number | null {
  if (line.end != null) return line.end;
  const times = line.words.map((w) => w.end ?? w.start).filter((t): t is number => t != null);
  return times.length ? Math.max(...times) : null;
}

/** Line duration in seconds when both edges are known, else null. */
export function lineDuration(line: Line): number | null {
  const s = effectiveStart(line);
  const e = effectiveEnd(line);
  if (s == null || e == null) return null;
  return Math.max(0, e - s);
}

export function isLineTimed(line: Line): boolean {
  return effectiveStart(line) != null;
}

export function countTimedWords(line: Line): number {
  return line.words.filter((w) => w.start != null).length;
}

export function totalWords(lines: Line[]): number {
  return lines.reduce((n, l) => n + l.words.length, 0);
}

/** Resolve a flat word-sync cursor index to its line + word. */
export function flatWordAt(
  lines: Line[],
  index: number
): { line: Line; word: Word; lineIndex: number; wordIndex: number } | null {
  let i = 0;
  for (let l = 0; l < lines.length; l += 1) {
    for (let w = 0; w < lines[l].words.length; w += 1) {
      if (i === index) return { line: lines[l], word: lines[l].words[w], lineIndex: l, wordIndex: w };
      i += 1;
    }
  }
  return null;
}

/** Index of the line active at time t, or -1. Uses effective start/end. */
export function activeLineIndex(lines: Line[], t: number): number {
  let active = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const s = effectiveStart(lines[i]);
    if (s == null) continue;
    if (t >= s) {
      const e = effectiveEnd(lines[i]);
      const nextStart = nextTimedStart(lines, i);
      const boundary = e ?? nextStart ?? Infinity;
      if (t < boundary || i === lines.length - 1) active = i;
    }
  }
  return active;
}

function nextTimedStart(lines: Line[], from: number): number | null {
  for (let i = from + 1; i < lines.length; i += 1) {
    const s = effectiveStart(lines[i]);
    if (s != null) return s;
  }
  return null;
}

/** Word index active at time t within a line, or -1. */
export function activeWordIndex(line: Line, t: number): number {
  let active = -1;
  for (let i = 0; i < line.words.length; i += 1) {
    const w = line.words[i];
    if (w.start == null) continue;
    if (t >= w.start) {
      const end = w.end ?? line.words[i + 1]?.start ?? effectiveEnd(line) ?? Infinity;
      if (t < end || i === line.words.length - 1) active = i;
    }
  }
  return active;
}

/**
 * Progress [0..1] through a word at time t, for the karaoke wipe.
 * Falls back to line span when the word lacks an explicit end.
 */
export function wordProgress(line: Line, index: number, t: number): number {
  const w = line.words[index];
  if (!w || w.start == null) return 0;
  const end = w.end ?? line.words[index + 1]?.start ?? effectiveEnd(line);
  if (end == null || end <= w.start) return t >= w.start ? 1 : 0;
  return Math.min(1, Math.max(0, (t - w.start) / (end - w.start)));
}

/** Nearest flag time to `time` within `threshold` seconds, else null. */
export function snapTime(time: number, snapPoints: number[], threshold: number): number {
  let best: number | null = null;
  let bestDist = threshold;
  for (const p of snapPoints) {
    const d = Math.abs(p - time);
    if (d <= bestDist) {
      best = p;
      bestDist = d;
    }
  }
  return best ?? time;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function emptyProject(name = "Untitled Project"): KaraokeProject {
  const now = Date.now();
  return {
    version: 2,
    id: uid("proj"),
    name,
    title: "",
    artist: "",
    audioFileName: null,
    audioDuration: null,
    lines: [],
    flags: [],
    takes: [],
    settings: { ...DEFAULT_SETTINGS },
    createdAt: now,
    updatedAt: now,
  };
}

export function toSummary(p: KaraokeProject): ProjectSummary {
  return {
    id: p.id,
    name: p.name,
    title: p.title,
    artist: p.artist,
    audioFileName: p.audioFileName,
    audioDuration: p.audioDuration,
    lineCount: p.lines.length,
    timedLineCount: p.lines.filter(isLineTimed).length,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}
