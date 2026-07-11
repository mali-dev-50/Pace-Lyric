import { DEFAULT_SETTINGS, type KaraokeProject, type Line, type Word } from "./types";

/**
 * A ready-made project seeded on first visit so the deployed tool isn't
 * empty. Ships with a bundled MP3 (public/sample) and line-timed lyrics
 * so every visitor lands on a real, working karaoke project to explore.
 */

export const SEED_ID = "seed_still_in_my_mind";
export const SEED_SEEDED_FLAG = "pace-lyric:seeded:v2";
export const SEED_AUDIO_URL = "/sample/still-in-my-mind-melody.mp3";
export const SEED_AUDIO_NAME = "still-in-my-mind-melody.mp3";
const SEED_DURATION = 192.981043;

/** Build a line-timed line (words carry no per-word timing). */
function lineOf(id: string, text: string, start: number, end: number): Line {
  const words: Word[] = text
    .split(/\s+/)
    .filter(Boolean)
    .map((t, i) => ({ id: `${id}_w${i}`, text: t, start: null, end: null }));
  return { id, words, start, end };
}

export function buildSeedProject(): KaraokeProject {
  const now = Date.now();
  const lines: Line[] = [
    lineOf("l1", "I still remember that day", 22.7, 25.09),
    lineOf("l2", "When you came my way", 25.09, 27.69),
    lineOf("l3", "Your laugh became my song", 27.69, 30.19),
    lineOf("l4", "With you I felt strong", 30.19, 32.91),
    lineOf("l5", "We watched the sunset glow", 32.91, 35.29),
    lineOf("l6", "Time was moving so slow", 35.29, 38),
  ];

  return {
    version: 2,
    id: SEED_ID,
    name: "Still in my mind",
    title: "Untitled Karaoke",
    artist: "",
    audioFileName: SEED_AUDIO_NAME,
    audioDuration: SEED_DURATION,
    lines,
    flags: [],
    takes: [],
    settings: { ...DEFAULT_SETTINGS },
    createdAt: now,
    updatedAt: now,
  };
}
