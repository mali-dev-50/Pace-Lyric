-- Pace Lyric — WIPE ALL DATA (clean slate for testing)
-- Run in Supabase: Dashboard → SQL Editor → New query → paste → Run.
-- This deletes EVERY project, share, and audio file for ALL users.
-- It does NOT delete user accounts (logins stay). Safe to re-run.

-- Remove stored audio (source MP3s + recorded-take WAVs)
delete from storage.objects where bucket_id = 'audio';

-- Remove all projects (project_shares rows cascade away automatically)
delete from public.projects;

-- Belt-and-suspenders: clear any orphaned shares
delete from public.project_shares;
