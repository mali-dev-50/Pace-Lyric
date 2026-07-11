"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  Eraser,
  FileDown,
  FileUp,
  MoreHorizontal,
  Loader2,
  MoveHorizontal,
  Music,
  Pencil,
  Save,
  Settings,
  TriangleAlert,
  UserPlus,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { extractPeaks } from "@/lib/waveform";
import { normalizeProject, putProject } from "@/lib/projects";
import { useAuth } from "./auth/AuthProvider";
import { Button } from "./ui/Button";
import { Menu } from "./ui/Menu";
import { Modal } from "./ui/Modal";
import { cn } from "@/lib/cn";
import { ShiftTimingDialog } from "./editor/ShiftTimingDialog";
import { SettingsDialog } from "./editor/SettingsDialog";
import { ShareDialog } from "./editor/ShareDialog";

export function Header() {
  const router = useRouter();
  const name = useStore((s) => s.project?.name ?? "");
  const artist = useStore((s) => s.project?.artist ?? "");
  const title = useStore((s) => s.project?.title ?? "");
  const audioFileName = useStore((s) => s.project?.audioFileName ?? null);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const rename = useStore((s) => s.rename);
  const persistProject = useStore((s) => s.persistProject);
  const saveAs = useStore((s) => s.saveAs);
  const exportLrc = useStore((s) => s.exportLrc);
  const exportJson = useStore((s) => s.exportJson);
  const attachAudio = useStore((s) => s.attachAudio);
  const setPeaks = useStore((s) => s.setPeaks);
  const clearAllTiming = useStore((s) => s.clearAllTiming);
  const pushToCloud = useStore((s) => s.pushToCloud);
  const projectId = useStore((s) => s.project?.id ?? "");
  const { cloudEnabled } = useAuth();

  const importRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<HTMLInputElement | null>(null);
  const [shiftOpen, setShiftOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [saveAsName, setSaveAsName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const doSave = async () => {
    persistProject();
    if (!cloudEnabled) {
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1600);
      return;
    }
    setSaveState("saving");
    const res = await pushToCloud();
    setSaveState(res.ok ? "saved" : "error");
    setTimeout(() => setSaveState("idle"), res.ok ? 1600 : 3200);
  };

  return (
    <header className="flex items-center gap-4 border-b border-[var(--color-line)] bg-[var(--color-surface)]/80 px-4 py-2.5 backdrop-blur-md">
      {/* left: back + project name */}
      <div className="flex min-w-0 items-center gap-2">
        <Link
          href="/tools/pace-lyrics"
          title="Back to Pace Lyrics"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          {editingName ? (
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => {
                setEditingName(false);
                if (nameDraft.trim()) rename(nameDraft);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") setEditingName(false);
              }}
              className="w-56 rounded-[var(--radius-xs)] border border-[var(--color-line-strong)] bg-[var(--color-bg)] px-2 py-0.5 text-sm font-semibold text-[var(--color-ink)] outline-none"
            />
          ) : (
            <button
              onClick={() => {
                setNameDraft(name);
                setEditingName(true);
              }}
              className="group flex items-center gap-1.5"
              title="Rename project"
            >
              <span className="truncate text-sm font-semibold text-[var(--color-ink)]">{name}</span>
              <Pencil className="h-3 w-3 text-[var(--color-ink-subtle)] opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          )}
          <p className="truncate text-[11px] text-[var(--color-ink-subtle)]">
            {title ? `${title}${artist ? ` · ${artist}` : ""}` : "Untitled song"}
          </p>
        </div>
      </div>

      {/* center: view toggle */}
      <div className="mx-auto flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-bg)] p-0.5">
        {(["editor", "preview", "record"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={cn(
              "rounded-[var(--radius-xs)] px-4 py-1.5 text-sm font-medium capitalize transition-colors",
              view === v
                ? "bg-[var(--color-surface-2)] text-[var(--color-ink)] shadow-[var(--shadow-sm)]"
                : "text-[var(--color-ink-subtle)] hover:text-[var(--color-ink)]"
            )}
            aria-pressed={view === v}
          >
            {v}
          </button>
        ))}
      </div>

      {/* right: actions */}
      <div className="flex items-center gap-2">
        <span className="hidden max-w-[150px] items-center gap-1.5 truncate text-xs text-[var(--color-ink-subtle)] xl:flex">
          <Music className="h-3.5 w-3.5 shrink-0" />
          {audioFileName ?? "No audio"}
        </span>
        {cloudEnabled && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShareOpen(true)}
            title="Share with a collaborator"
          >
            <UserPlus className="h-4 w-4" /> Share
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={doSave} className="min-w-[92px]" disabled={saveState === "saving"}>
          {saveState === "saving" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Saving
            </>
          ) : saveState === "saved" ? (
            <>
              <Check className="h-4 w-4 text-[var(--color-positive)]" /> Saved
            </>
          ) : saveState === "error" ? (
            <>
              <TriangleAlert className="h-4 w-4 text-[var(--color-danger)]" /> Retry
            </>
          ) : (
            <>
              <Save className="h-4 w-4" /> Save
            </>
          )}
        </Button>
        <Button variant="primary" size="sm" onClick={exportLrc}>
          <Download className="h-4 w-4" /> Export .lrc
        </Button>
        <Menu
          trigger={
            <span className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-line)] text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]">
              <MoreHorizontal className="h-4 w-4" />
            </span>
          }
          items={[
            {
              label: "Save as new project…",
              icon: <Copy className="h-4 w-4" />,
              onClick: () => {
                setSaveAsName(`${name} copy`);
                setSaveAsOpen(true);
              },
            },
            {
              label: "Project settings…",
              icon: <Settings className="h-4 w-4" />,
              onClick: () => setSettingsOpen(true),
            },
            "divider",
            {
              label: "Export project (.json)",
              icon: <FileDown className="h-4 w-4" />,
              onClick: exportJson,
            },
            {
              label: "Import into new project…",
              icon: <FileUp className="h-4 w-4" />,
              onClick: () => importRef.current?.click(),
            },
            {
              label: "Replace audio…",
              icon: <Music className="h-4 w-4" />,
              onClick: () => audioRef.current?.click(),
            },
            "divider",
            {
              label: "Shift all timing…",
              icon: <MoveHorizontal className="h-4 w-4" />,
              onClick: () => setShiftOpen(true),
            },
            {
              label: "Clear all timing",
              icon: <Eraser className="h-4 w-4" />,
              onClick: () => {
                if (confirm("Clear all timing? Lyrics and flags are kept; every timestamp is reset."))
                  clearAllTiming();
              },
              danger: true,
            },
          ]}
        />
      </div>

      {/* hidden inputs */}
      <input
        ref={importRef}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          const project = normalizeProject(JSON.parse(await file.text()), file.name.replace(/\.[^.]+$/, ""));
          if (!project) {
            alert("That file isn't a valid Pace Lyrics project.");
            return;
          }
          putProject(project);
          router.push(`/editor/${project.id}`);
        }}
      />
      <input
        ref={audioRef}
        type="file"
        accept="audio/mpeg,audio/mp3,.mp3"
        className="sr-only"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          await attachAudio(file, file.name);
          try {
            setPeaks(await extractPeaks(file));
          } catch {
            /* ignore */
          }
        }}
      />

      <ShiftTimingDialog open={shiftOpen} onClose={() => setShiftOpen(false)} />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      {cloudEnabled && (
        <ShareDialog open={shareOpen} onClose={() => setShareOpen(false)} projectId={projectId} />
      )}

      <Modal
        open={saveAsOpen}
        onClose={() => setSaveAsOpen(false)}
        title="Save as new project"
        description="Creates a separate copy with its own audio and timing. Your current project is kept."
        footer={
          <>
            <Button variant="ghost" onClick={() => setSaveAsOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={async () => {
                const id = await saveAs(saveAsName);
                setSaveAsOpen(false);
                if (id) router.push(`/editor/${id}`);
              }}
            >
              Create copy
            </Button>
          </>
        }
      >
        <input
          autoFocus
          value={saveAsName}
          onChange={(e) => setSaveAsName(e.target.value)}
          className="h-11 w-full rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-bg)] px-3 text-sm text-[var(--color-ink)] outline-none focus-visible:border-[var(--color-accent)]"
        />
      </Modal>
    </header>
  );
}
