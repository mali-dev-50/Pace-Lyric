import { AUDIO_BUCKET, sourceAudioPath, supabase, takeAudioPath } from "./supabase";
import { normalizeProject } from "./projects";
import { toSummary } from "./model";
import { loadAudioBlob, loadTakeBlob, saveAudioBlob, saveTakeBlob } from "./storage";
import type { KaraokeProject, ProjectSummary } from "./types";

/**
 * Cloud sync layer (Supabase). Every function is a safe no-op when Supabase
 * isn't configured, so the app runs identically in local-only mode.
 *
 * Model: each project is one row (`data` holds the full project JSON); source
 * MP3s and recorded-take WAVs live in the `audio` Storage bucket. Access is
 * enforced server-side by Row Level Security — you see a project only if you
 * own it or it's shared with your email.
 */

export interface CloudUser {
  id: string;
  email: string;
}

export interface CloudProject {
  summary: ProjectSummary;
  project: KaraokeProject;
  /** True when another account owns this project (it was shared with you). */
  sharedWithMe: boolean;
  updatedByEmail: string | null;
  updatedAt: number;
}

async function currentUser(): Promise<CloudUser | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const u = data.session?.user;
  if (!u?.email) return null;
  return { id: u.id, email: u.email };
}

// ── Projects ────────────────────────────────────────────────────────────────

/** All projects the signed-in user can access (owned + shared with them). */
export async function listCloudProjects(): Promise<CloudProject[]> {
  if (!supabase) return [];
  const me = await currentUser();
  if (!me) return [];
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, data, owner_id, updated_at, updated_by_email")
    .order("updated_at", { ascending: false });
  if (error || !data) return [];
  const out: CloudProject[] = [];
  for (const row of data) {
    const project = normalizeProject(row.data, row.name);
    if (!project) continue;
    out.push({
      project,
      summary: toSummary(project),
      sharedWithMe: row.owner_id !== me.id,
      updatedByEmail: row.updated_by_email ?? null,
      updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : project.updatedAt,
    });
  }
  return out;
}

/** Fetch one project's server timestamp — used to detect a newer remote copy. */
export async function fetchCloudUpdatedAt(id: string): Promise<number | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("projects")
    .select("updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error || !data?.updated_at) return null;
  return new Date(data.updated_at).getTime();
}

export interface SaveResult {
  ok: boolean;
  updatedAt?: number;
  error?: string;
}

/**
 * Push a project to the cloud. Updates in place when the row exists (preserving
 * the original owner for shared projects); inserts a new owned row otherwise.
 */
export async function saveCloudProject(project: KaraokeProject): Promise<SaveResult> {
  if (!supabase) return { ok: true };
  const me = await currentUser();
  if (!me) return { ok: false, error: "You're signed out." };

  const nowIso = new Date().toISOString();
  const payload = {
    name: project.name,
    data: project,
    updated_at: nowIso,
    updated_by: me.id,
    updated_by_email: me.email,
  };

  const { data: updated, error: updErr } = await supabase
    .from("projects")
    .update(payload)
    .eq("id", project.id)
    .select("id");
  if (updErr) return { ok: false, error: updErr.message };
  if (updated && updated.length > 0) return { ok: true, updatedAt: new Date(nowIso).getTime() };

  const { error: insErr } = await supabase
    .from("projects")
    .insert({ id: project.id, owner_id: me.id, ...payload });
  if (insErr) return { ok: false, error: insErr.message };
  return { ok: true, updatedAt: new Date(nowIso).getTime() };
}

/** Push a project's JSON plus its locally-cached audio + take WAVs to the cloud. */
export async function pushProjectWithAssets(project: KaraokeProject): Promise<void> {
  if (!supabase) return;
  await saveCloudProject(project);
  const src = await loadAudioBlob(project.id);
  if (src) await uploadSourceAudio(project.id, src);
  for (const t of project.takes ?? []) {
    const blob = await loadTakeBlob(t.id);
    if (blob) await uploadTakeAudio(project.id, t.id, blob);
  }
}

export async function deleteCloudProject(id: string): Promise<void> {
  if (!supabase) return;
  await supabase.from("projects").delete().eq("id", id);
  // Best-effort: remove the project's audio folder.
  const { data } = await supabase.storage.from(AUDIO_BUCKET).list(id, { limit: 100 });
  if (data?.length) {
    await supabase.storage.from(AUDIO_BUCKET).remove(data.map((f) => `${id}/${f.name}`));
  }
  const { data: takes } = await supabase.storage.from(AUDIO_BUCKET).list(`${id}/takes`, { limit: 500 });
  if (takes?.length) {
    await supabase.storage
      .from(AUDIO_BUCKET)
      .remove(takes.map((f) => `${id}/takes/${f.name}`));
  }
}

// ── Audio storage ─────────────────────────────────────────────────────────────

export async function uploadSourceAudio(projectId: string, blob: Blob): Promise<void> {
  if (!supabase) return;
  await supabase.storage
    .from(AUDIO_BUCKET)
    .upload(sourceAudioPath(projectId), blob, {
      upsert: true,
      contentType: blob.type || "audio/mpeg",
    });
}

export async function uploadTakeAudio(projectId: string, takeId: string, blob: Blob): Promise<void> {
  if (!supabase) return;
  await supabase.storage
    .from(AUDIO_BUCKET)
    .upload(takeAudioPath(projectId, takeId), blob, {
      upsert: true,
      contentType: "audio/wav",
    });
}

export async function deleteTakeAudio(projectId: string, takeId: string): Promise<void> {
  if (!supabase) return;
  await supabase.storage.from(AUDIO_BUCKET).remove([takeAudioPath(projectId, takeId)]);
}

/**
 * Ensure a project's source MP3 is present in the local IndexedDB cache,
 * downloading it from the cloud when missing (e.g. a collaborator's first open).
 * Returns the blob if it ended up available locally.
 */
export async function hydrateSourceAudio(projectId: string): Promise<Blob | null> {
  const local = await loadAudioBlob(projectId);
  if (local) return local;
  if (!supabase) return null;
  const { data } = await supabase.storage.from(AUDIO_BUCKET).download(sourceAudioPath(projectId));
  if (!data) return null;
  await saveAudioBlob(projectId, data);
  return data;
}

/** Same as hydrateSourceAudio but for one recorded-take WAV. */
export async function hydrateTakeAudio(projectId: string, takeId: string): Promise<Blob | null> {
  const local = await loadTakeBlob(takeId);
  if (local) return local;
  if (!supabase) return null;
  const { data } = await supabase.storage.from(AUDIO_BUCKET).download(takeAudioPath(projectId, takeId));
  if (!data) return null;
  await saveTakeBlob(takeId, data);
  return data;
}

// ── Sharing ───────────────────────────────────────────────────────────────────

export async function listShares(projectId: string): Promise<string[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("project_shares")
    .select("email")
    .eq("project_id", projectId);
  if (error || !data) return [];
  return data.map((r) => r.email as string);
}

export async function addShare(projectId: string, email: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "Cloud sync is off." };
  const clean = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) return { ok: false, error: "Enter a valid email." };
  const { error } = await supabase
    .from("project_shares")
    .insert({ project_id: projectId, email: clean });
  if (error && !/duplicate key/i.test(error.message)) return { ok: false, error: error.message };
  return { ok: true };
}

export async function removeShare(projectId: string, email: string): Promise<void> {
  if (!supabase) return;
  await supabase
    .from("project_shares")
    .delete()
    .eq("project_id", projectId)
    .eq("email", email.trim().toLowerCase());
}
