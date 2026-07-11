import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client for cloud sync (accounts, shared projects, audio storage).
 *
 * Both values are PUBLIC (safe to ship to the browser): the anon key only ever
 * grants what Row Level Security allows. They come from env so the app still
 * builds and runs in pure local-only mode when they're absent.
 *
 *   NEXT_PUBLIC_SUPABASE_URL        e.g. https://xxxx.supabase.co
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY   the project's anon/public key
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** True when cloud sync is configured; otherwise the app runs local-only. */
export const isCloudEnabled = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isCloudEnabled
  ? createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

/** Storage bucket that holds source MP3s and recorded-take WAVs. */
export const AUDIO_BUCKET = "audio";

/** Storage path helpers — the first path segment is always the project id, */
/** which the storage security policies use to authorize access.            */
export const sourceAudioPath = (projectId: string) => `${projectId}/source`;
export const takeAudioPath = (projectId: string, takeId: string) =>
  `${projectId}/takes/${takeId}.wav`;
