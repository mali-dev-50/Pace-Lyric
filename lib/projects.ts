import { DEFAULT_SETTINGS, type KaraokeProject, type ProjectSummary } from "./types";
import { emptyProject, toSummary, uid } from "./model";
import {
  clearLegacyAudioBlob,
  copyAudioBlob,
  copyTakeBlob,
  deleteAudioBlob,
  deleteTakeBlob,
  loadLegacyAudioBlob,
  saveAudioBlob,
} from "./storage";
import { buildSeedProject, SEED_AUDIO_URL, SEED_SEEDED_FLAG } from "./seed";

/**
 * Project registry. Full projects live at `pace-lyric:project:{id}`; a
 * lightweight index of summaries lives at `pace-lyric:index:v2` for the
 * dashboard. Everything is client-side (localStorage + IndexedDB).
 */

const INDEX_KEY = "pace-lyric:index:v2";
const projectKey = (id: string) => `pace-lyric:project:${id}`;
const LEGACY_PROJECT_KEY = "pace-lyric:project:v1";

function ls(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

/** Coerce any raw/legacy object into a valid v2 project. */
export function normalizeProject(raw: unknown, fallbackName = "Imported Project"): KaraokeProject | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Partial<KaraokeProject> & { version?: number };
  if (!Array.isArray(p.lines)) return null;
  const now = Date.now();
  return {
    version: 2,
    id: typeof p.id === "string" ? p.id : uid("proj"),
    name: p.name || p.title || fallbackName,
    title: p.title ?? "",
    artist: p.artist ?? "",
    audioFileName: p.audioFileName ?? null,
    audioDuration: p.audioDuration ?? null,
    lines: p.lines,
    flags: Array.isArray(p.flags) ? p.flags : [],
    takes: Array.isArray(p.takes) ? p.takes : [],
    settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) },
    createdAt: p.createdAt ?? now,
    updatedAt: p.updatedAt ?? now,
  };
}

export function listProjects(): ProjectSummary[] {
  const store = ls();
  if (!store) return [];
  try {
    const raw = store.getItem(INDEX_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as ProjectSummary[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeIndex(summaries: ProjectSummary[]): void {
  ls()?.setItem(INDEX_KEY, JSON.stringify(summaries));
}

function upsertIndex(project: KaraokeProject): void {
  const summary = toSummary(project);
  const list = listProjects().filter((s) => s.id !== project.id);
  list.push(summary);
  writeIndex(list);
}

export function getProject(id: string): KaraokeProject | null {
  const store = ls();
  if (!store) return null;
  try {
    const raw = store.getItem(projectKey(id));
    if (!raw) return null;
    return normalizeProject(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Persist a project's full record and refresh its index summary. */
export function putProject(project: KaraokeProject): void {
  const store = ls();
  if (!store) return;
  try {
    store.setItem(projectKey(project.id), JSON.stringify(project));
    upsertIndex(project);
  } catch {
    /* quota — non-fatal */
  }
}

export function createProject(name: string): KaraokeProject {
  const project = emptyProject(name.trim() || "Untitled Project");
  putProject(project);
  return project;
}

export function renameProject(id: string, name: string): void {
  const project = getProject(id);
  if (!project) return;
  project.name = name.trim() || project.name;
  project.updatedAt = Date.now();
  putProject(project);
}

export async function deleteProject(id: string): Promise<void> {
  const project = getProject(id);
  ls()?.removeItem(projectKey(id));
  writeIndex(listProjects().filter((s) => s.id !== id));
  await deleteAudioBlob(id);
  await Promise.all((project?.takes ?? []).map((t) => deleteTakeBlob(t.id)));
}

export async function duplicateProject(id: string): Promise<KaraokeProject | null> {
  const source = getProject(id);
  if (!source) return null;
  const now = Date.now();
  // Re-key each take so the duplicate owns its own take blobs; deleting one
  // project's take must never affect the other's.
  const takeIdMap = (source.takes ?? []).map((t) => ({ from: t.id, to: uid("take") }));
  const copy: KaraokeProject = {
    ...structuredClone(source),
    id: uid("proj"),
    name: `${source.name} copy`,
    takes: (source.takes ?? []).map((t, i) => ({ ...t, id: takeIdMap[i].to })),
    createdAt: now,
    updatedAt: now,
  };
  putProject(copy);
  await copyAudioBlob(id, copy.id);
  await Promise.all(takeIdMap.map(({ from, to }) => copyTakeBlob(from, to)));
  return copy;
}

/**
 * Seed a bundled sample project on first visit — but only when the user has
 * no projects yet and we've never seeded before. The one-time flag means a
 * user who deletes the demo won't see it return, and we never overwrite real
 * work. Returns true if the demo was created.
 */
export async function seedDemoIfEmpty(): Promise<boolean> {
  const store = ls();
  if (!store) return false;
  if (store.getItem(SEED_SEEDED_FLAG)) return false;
  store.setItem(SEED_SEEDED_FLAG, "1");
  if (listProjects().length > 0) return false;

  const project = buildSeedProject();
  putProject(project);
  try {
    const res = await fetch(SEED_AUDIO_URL);
    if (res.ok) await saveAudioBlob(project.id, await res.blob());
  } catch {
    /* offline on first load — project still opens, audio can be re-imported */
  }
  return true;
}

/**
 * One-time migration: if a legacy v1 single-project exists and the new
 * index is empty, fold it into the multi-project system.
 */
export async function migrateLegacy(): Promise<void> {
  const store = ls();
  if (!store) return;
  const legacyRaw = store.getItem(LEGACY_PROJECT_KEY);
  if (!legacyRaw) return;
  if (listProjects().length > 0) {
    store.removeItem(LEGACY_PROJECT_KEY);
    return;
  }
  try {
    const project = normalizeProject(JSON.parse(legacyRaw), "My First Karaoke");
    if (project) {
      putProject(project);
      const blob = await loadLegacyAudioBlob();
      if (blob) await saveAudioBlob(project.id, blob);
    }
  } catch {
    /* ignore malformed legacy data */
  } finally {
    store.removeItem(LEGACY_PROJECT_KEY);
    await clearLegacyAudioBlob();
  }
}
