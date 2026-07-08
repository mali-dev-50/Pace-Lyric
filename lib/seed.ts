import { DEFAULT_SETTINGS, type KaraokeProject, type Line, type Word } from "./types";

/**
 * A ready-made sample project seeded on first visit so the deployed tool
 * isn't empty. It ships with a bundled 16s demo track (public/sample) and
 * fully timed, word-level lyrics + flags to showcase the workflow.
 */

export const SEED_ID = "seed_demo_v1";
export const SEED_SEEDED_FLAG = "pace-lyric:seeded:v1";
export const SEED_AUDIO_URL = "/sample/pace-demo.wav";
export const SEED_AUDIO_NAME = "pace-demo.wav";
const SEED_DURATION = 16;

/** Build a line with evenly paced word start times across [start, end]. */
function timedLine(id: string, text: string, start: number, end: number): Line {
  const tokens = text.split(/\s+/).filter(Boolean);
  const step = (end - start) / tokens.length;
  const words: Word[] = tokens.map((tok, i) => ({
    id: `${id}_w${i}`,
    text: tok,
    start: Math.round((start + i * step) * 100) / 100,
    end: i === tokens.length - 1 ? Math.round(end * 100) / 100 : Math.round((start + (i + 1) * step) * 100) / 100,
  }));
  return { id, words, start, end };
}

export function buildSeedProject(): KaraokeProject {
  const now = Date.now();
  const lines: Line[] = [
    timedLine("l1", "Chasing the light on a sky-blue morning", 0.3, 3.8),
    timedLine("l2", "Every second counts as the beat keeps forming", 4.2, 7.8),
    timedLine("l3", "Hold this moment, let it shine", 8.2, 11.7),
    timedLine("l4", "Perfect timing, line by line", 12.1, 15.6),
  ];

  return {
    version: 2,
    id: SEED_ID,
    name: "Demo — Sky High (sample)",
    title: "Sky High",
    artist: "Pace Lyric Demo",
    audioFileName: SEED_AUDIO_NAME,
    audioDuration: SEED_DURATION,
    lines,
    flags: [
      { id: "f_verse", time: 0.3, label: "Verse" },
      { id: "f_chorus", time: 8.2, label: "Chorus" },
    ],
    settings: { ...DEFAULT_SETTINGS, timelineZoom: 40 },
    createdAt: now,
    updatedAt: now,
  };
}
