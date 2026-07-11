/**
 * Core data model for a Pace Lyric karaoke project (schema v2).
 * Times are stored in seconds (floating point) throughout.
 */

export interface Word {
  id: string;
  text: string;
  /** Absolute start time in seconds, or null if not yet timed. */
  start: number | null;
  /** Absolute end time in seconds, or null if not yet timed. */
  end: number | null;
}

export interface Line {
  id: string;
  words: Word[];
  /** Line-level start; falls back to first timed word when null. */
  start: number | null;
  /** Line-level end; falls back to last timed word when null. */
  end: number | null;
}

/** A draggable timeline marker used for visual synchronization. */
export interface Flag {
  id: string;
  time: number;
  label: string;
}

/**
 * A saved performance take. The recorded microphone (voice) stem is persisted
 * as a WAV blob in IndexedDB (keyed by this id); the backing track stays the
 * project's MP3, so a saved take can be re-mixed, played, and exported — as the
 * clean voice alone or mixed with the music — long after it was recorded.
 */
export interface RecordedTake {
  id: string;
  /** User-facing name for the take (e.g. "Take 1", "Chorus try"). */
  name: string;
  createdAt: number;
  /** Length of the recorded voice stem, in seconds. */
  duration: number;
  /** Sample rate of the stored voice stem. */
  sampleRate: number;
  /** Voice fader captured with the take (default for playback/export). */
  micGain: number;
  /** Music fader captured with the take (default for playback/export). */
  trackGain: number;
}

/** Project-specific karaoke configuration. */
export interface ProjectSettings {
  /** "Get ready" lead-in window (seconds) shown before a line in preview. */
  leadInSeconds: number;
  /** Whether the preview animates a per-word wipe (vs. line-level). */
  wordWipe: boolean;
  /** Pixels-per-second baseline zoom for the timeline. */
  timelineZoom: number;
  /** Record mixer: microphone (voice) level, 0..1.5. */
  micGain: number;
  /** Record mixer: backing-track level, 0..1.5. */
  trackGain: number;
}

export interface KaraokeProject {
  version: 2;
  id: string;
  /** Project name (for the dashboard); distinct from the song title. */
  name: string;
  title: string;
  artist: string;
  /** Original file name of the imported MP3, for display + re-linking. */
  audioFileName: string | null;
  audioDuration: number | null;
  lines: Line[];
  flags: Flag[];
  /** Saved recording takes (voice stems persisted separately in IndexedDB). */
  takes: RecordedTake[];
  settings: ProjectSettings;
  createdAt: number;
  updatedAt: number;
}

/** Lightweight record used by the dashboard list (no line/flag payload). */
export interface ProjectSummary {
  id: string;
  name: string;
  title: string;
  artist: string;
  audioFileName: string | null;
  audioDuration: number | null;
  lineCount: number;
  timedLineCount: number;
  createdAt: number;
  updatedAt: number;
}

export type TimingLevel = "line" | "word";

export const DEFAULT_SETTINGS: ProjectSettings = {
  leadInSeconds: 4,
  wordWipe: true,
  timelineZoom: 12,
  micGain: 1,
  trackGain: 1,
};
