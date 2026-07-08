"use client";

import { useStore } from "@/lib/store";
import { useKeyboard } from "@/lib/useKeyboard";
import { Header } from "./Header";
import { Waveform } from "./Waveform";
import { TransportBar } from "./TransportBar";
import { Timeline } from "./timeline/Timeline";
import { SyncBar } from "./editor/SyncBar";
import { LyricsPanel } from "./editor/LyricsPanel";
import { Inspector } from "./editor/Inspector";
import { KaraokePreview } from "./preview/KaraokePreview";
import { RecordStudio } from "./record/RecordStudio";

export function Workspace() {
  const view = useStore((s) => s.view);
  useKeyboard();

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <Header />

      <main className="flex min-h-0 flex-1 flex-col gap-3 p-3">
        {/* Audio transport + waveform (the recorder manages its own audio) */}
        {view !== "record" && (
          <section className="shrink-0 rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-3">
            <div className="mb-3">
              <Waveform />
            </div>
            <TransportBar />
          </section>
        )}

        {view === "editor" ? (
          <>
            <div className="shrink-0">
              <Timeline />
            </div>
            <div className="shrink-0">
              <SyncBar />
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[1fr_360px]">
              <LyricsPanel />
              <div className="hidden min-h-0 lg:block">
                <Inspector />
              </div>
            </div>
          </>
        ) : view === "preview" ? (
          <KaraokePreview />
        ) : (
          <RecordStudio />
        )}
      </main>
    </div>
  );
}
