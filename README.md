# SilverStone Studio

The central studio dashboard for SilverStone Studio — a web app where all music-production work is managed in one place. Tools live inside the dashboard; the first is **Pace Lyrics**.

Built with **Next.js 15 (App Router)**, **TypeScript**, **Tailwind CSS v4**, **Zustand**, and **Framer Motion**, with **Supabase** for cloud sync (accounts, shared projects, audio storage). Deploys on **Vercel**.

## Tools

### Pace Lyrics — Karaoke Timing Studio

A professional studio for building precisely synchronized karaoke lyrics from your own MP3s. Manage multiple projects, time lyrics on a draggable timeline, fine-tune every line in a dedicated inspector, preview with studio-grade animations, record vocal takes over the backing track, and export a standard `.lrc` file or a mixed MP3.

## Features

### Dashboard & project management
- **Multi-project home screen** — view, search, and sort (Recent / Name / Created) all saved projects as cards showing song details, audio file, timing progress, and last-edited time.
- Full lifecycle: **Create, Rename, Save, Save As, Open, Duplicate, Delete**, plus **Import / Export** project JSON.
- Each project persists its lyrics, all timing, timeline flags, karaoke settings, and its MP3 (cached in IndexedDB), so reopening restores the complete session.

### Timeline-based editing
- A professional **timeline** renders every timed line as a **draggable region** — drag the body to move, drag the edges to trim the in/out points.
- **Flags (markers)** you can place anywhere, drag to fine-tune, label (e.g. "Chorus"), and **snap** line edges to.
- Zoomable, scrollable, with a time ruler, live playhead, and edge-snapping to flags, line boundaries, and the playhead.

### Line inspector
- Selecting a line opens a **dedicated inspector**: editable **In point**, **Out point**, and auto-calculated **Duration**, each editable to 1/100s with nudge controls, set-to-playhead, and snap-to-flag.
- Word-level timing lives here too — stamp or type each word's onset.
- Selecting a flag swaps the inspector to flag controls (label, position, delete).

### Audio & sync
- Import any MP3; full transport (play/pause, ±5s, restart), variable rate (0.5×–1.5×), volume, and a rendered **waveform** with click/drag seeking and lyric markers.
- **Tap-to-sync** — play and tap `Space` in time to stamp cues at line or word granularity, with undo.

### Karaoke preview
- A polished stage with per-word **wipe animation**, a **pace-guidance bar** (word-onset ticks + moving playhead + time-remaining), a "get ready" countdown, and a dimmed next-line preview.
- Every timing edit reflects **instantly**; the active line highlights during playback.

### Record your performance
- A **Record** mode plays the backing track while showing the karaoke guide, captures your **microphone mixed with the track**, and encodes the result to an **MP3 you can play back and download** — your voice over the melody, in one file.
- **Stem-based mixing** — your voice is recorded on its own track and the music is mixed in at playback/export. A built-in **mixer** (independent **Your voice** / **Music** faders, 0–150%) lets you **re-balance after the take**: move a fader and the review playback *and* the downloaded MP3 update instantly — no re-recording. Levels are saved with the project.
- Runs entirely client-side (Web Audio + a bundled MP3 encoder); the main player's audio is never rerouted, and the mic isn't monitored on the speakers (use headphones to avoid bleed).

### Export
- Standard `.lrc` with enhanced inline word-level timestamps supported by most karaoke players.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `Space` | Tap (while syncing) · otherwise Play/Pause |
| `K` | Play/Pause |
| `J` / `L` | Seek −5s / +5s |
| `←` / `→` | Seek −1s / +1s |
| `Enter` | Tap (sync mode) |
| `Backspace` | Undo last tap (sync mode) |

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm run start    # serve the production build
```

## Deploying to Vercel

Push to a Git repository and import it in Vercel. No environment variables or backend are required — it's a fully static + client-side app.

## Architecture

```
app/
  page.tsx            Dashboard (project home)
  editor/[id]/        Per-project editor route
  layout.tsx          Root layout, fonts, icon, global tokens
components/
  Dashboard, Header, Workspace, Waveform, TransportBar, AudioEngine, ImportScreen
  timeline/Timeline   Draggable regions + flags
  editor/             Inspector, LyricsPanel, LineRow, SyncBar, dialogs, TimeField, WordChip
  preview/            KaraokePreview, PaceGuide
  ui/                 Button, Menu, Modal
lib/
  types, model        Domain types + pure helpers
  store               Zustand store (open/save projects, timing, flags, playback, sync)
  projects, storage   Multi-project registry (localStorage) + audio blobs (IndexedDB)
  lrc, waveform, time, useKeyboard
```

State for the open project lives in a single Zustand store; a headless `AudioEngine` owns the one `<audio>` element and drives a `requestAnimationFrame` loop for smooth playback-time updates. Timeline drags update in memory for smoothness and persist once on release. All design values come from CSS custom-property tokens in `app/globals.css`.

## Data & privacy

Everything stays on your device. Project metadata and timing are stored in `localStorage`; imported MP3s are cached in IndexedDB. Nothing is uploaded.
