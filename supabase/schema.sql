-- Pace Lyric — cloud sync schema
-- Run this once in your Supabase project: Dashboard → SQL Editor → New query →
-- paste all of this → Run. Safe to re-run (idempotent).
--
-- Model: each project is one row with its full JSON in `data`; audio files
-- (source MP3 + recorded-take WAVs) live in the `audio` Storage bucket under a
-- path that starts with the project id. Access = you own it OR it's shared with
-- your email. Everything is guarded by Row Level Security.

-- ─────────────────────────────────────────────────────────────────────────────
-- Tables
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.projects (
  id              text primary key,
  owner_id        uuid not null references auth.users on delete cascade,
  name            text not null default 'Untitled Project',
  data            jsonb not null,
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users,
  updated_by_email text,
  created_at      timestamptz not null default now()
);

create index if not exists projects_owner_idx on public.projects (owner_id);

create table if not exists public.project_shares (
  project_id  text not null references public.projects on delete cascade,
  email       text not null,
  created_at  timestamptz not null default now(),
  primary key (project_id, email)
);

create index if not exists project_shares_email_idx on public.project_shares (lower(email));

-- ─────────────────────────────────────────────────────────────────────────────
-- Access helper (security definer avoids RLS recursion between the two tables)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.can_access_project(pid text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.projects p
    where p.id = pid
      and (
        p.owner_id = auth.uid()
        or exists (
          select 1 from public.project_shares s
          where s.project_id = p.id
            and lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
      )
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security — projects
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.projects enable row level security;

drop policy if exists "projects_select" on public.projects;
create policy "projects_select" on public.projects
  for select using (public.can_access_project(id));

drop policy if exists "projects_insert" on public.projects;
create policy "projects_insert" on public.projects
  for insert with check (owner_id = auth.uid());

drop policy if exists "projects_update" on public.projects;
create policy "projects_update" on public.projects
  for update using (public.can_access_project(id))
  with check (public.can_access_project(id));

drop policy if exists "projects_delete" on public.projects;
create policy "projects_delete" on public.projects
  for delete using (owner_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security — project_shares (only the owner manages sharing)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.project_shares enable row level security;

drop policy if exists "shares_select" on public.project_shares;
create policy "shares_select" on public.project_shares
  for select using (public.can_access_project(project_id));

drop policy if exists "shares_insert" on public.project_shares;
create policy "shares_insert" on public.project_shares
  for insert with check (
    exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid())
  );

drop policy if exists "shares_delete" on public.project_shares;
create policy "shares_delete" on public.project_shares
  for delete using (
    exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Storage bucket + policies (audio: source MP3 + take WAVs)
-- First path segment is the project id → reuse can_access_project().
-- ─────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('audio', 'audio', false)
on conflict (id) do nothing;

drop policy if exists "audio_select" on storage.objects;
create policy "audio_select" on storage.objects
  for select using (
    bucket_id = 'audio' and public.can_access_project((storage.foldername(name))[1])
  );

drop policy if exists "audio_insert" on storage.objects;
create policy "audio_insert" on storage.objects
  for insert with check (
    bucket_id = 'audio' and public.can_access_project((storage.foldername(name))[1])
  );

drop policy if exists "audio_update" on storage.objects;
create policy "audio_update" on storage.objects
  for update using (
    bucket_id = 'audio' and public.can_access_project((storage.foldername(name))[1])
  );

drop policy if exists "audio_delete" on storage.objects;
create policy "audio_delete" on storage.objects
  for delete using (
    bucket_id = 'audio' and public.can_access_project((storage.foldername(name))[1])
  );
