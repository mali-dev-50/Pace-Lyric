import { del, get, set } from "idb-keyval";

/**
 * Low-level binary storage: each project's MP3 blob lives in IndexedDB,
 * keyed by project id, so a reload restores the full session including audio.
 */

const audioKey = (projectId: string) => `pace-lyric:audio:${projectId}`;

export async function loadAudioBlob(projectId: string): Promise<Blob | null> {
  try {
    return (await get<Blob>(audioKey(projectId))) ?? null;
  } catch {
    return null;
  }
}

export async function saveAudioBlob(projectId: string, blob: Blob): Promise<void> {
  try {
    await set(audioKey(projectId), blob);
  } catch {
    /* IndexedDB unavailable — audio simply won't persist */
  }
}

export async function deleteAudioBlob(projectId: string): Promise<void> {
  try {
    await del(audioKey(projectId));
  } catch {
    /* ignore */
  }
}

export async function copyAudioBlob(fromId: string, toId: string): Promise<void> {
  const blob = await loadAudioBlob(fromId);
  if (blob) await saveAudioBlob(toId, blob);
}

/**
 * Recorded-take audio (the voice stem, stored as a WAV blob) lives in IndexedDB
 * keyed by take id, independent of the project record so takes can be added and
 * removed without rewriting the whole project payload.
 */
const takeKey = (takeId: string) => `pace-lyric:take:${takeId}`;

export async function loadTakeBlob(takeId: string): Promise<Blob | null> {
  try {
    return (await get<Blob>(takeKey(takeId))) ?? null;
  } catch {
    return null;
  }
}

export async function saveTakeBlob(takeId: string, blob: Blob): Promise<void> {
  try {
    await set(takeKey(takeId), blob);
  } catch {
    /* IndexedDB unavailable — take audio simply won't persist */
  }
}

export async function deleteTakeBlob(takeId: string): Promise<void> {
  try {
    await del(takeKey(takeId));
  } catch {
    /* ignore */
  }
}

export async function copyTakeBlob(fromId: string, toId: string): Promise<void> {
  const blob = await loadTakeBlob(fromId);
  if (blob) await saveTakeBlob(toId, blob);
}

/** Legacy v1 single-project audio key (for one-time migration). */
export const LEGACY_AUDIO_KEY = "pace-lyric:audio-blob:v1";
export async function loadLegacyAudioBlob(): Promise<Blob | null> {
  try {
    return (await get<Blob>(LEGACY_AUDIO_KEY)) ?? null;
  } catch {
    return null;
  }
}
export async function clearLegacyAudioBlob(): Promise<void> {
  try {
    await del(LEGACY_AUDIO_KEY);
  } catch {
    /* ignore */
  }
}
