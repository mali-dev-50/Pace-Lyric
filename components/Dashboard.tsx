"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  AudioLines,
  Clock,
  Copy,
  FileUp,
  Music,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import {
  createProject,
  deleteProject,
  duplicateProject,
  getProject,
  listProjects,
  migrateLegacy,
  normalizeProject,
  putProject,
  renameProject,
} from "@/lib/projects";
import {
  deleteCloudProject,
  listCloudProjects,
  pushProjectWithAssets,
  saveCloudProject,
} from "@/lib/cloud";
import type { ProjectSummary } from "@/lib/types";
import { useAuth } from "./auth/AuthProvider";
import { Button } from "./ui/Button";
import { Menu } from "./ui/Menu";
import { Modal } from "./ui/Modal";
import { cn } from "@/lib/cn";
import { formatShort } from "@/lib/time";

type SortKey = "recent" | "name" | "created";

/** Extra per-project info that only exists in cloud mode. */
interface CloudMeta {
  sharedWithMe: boolean;
  updatedByEmail: string | null;
}

export function Dashboard() {
  const router = useRouter();
  const { cloudEnabled } = useAuth();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [meta, setMeta] = useState<Record<string, CloudMeta>>({});
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");

  const [createOpen, setCreateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ProjectSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectSummary | null>(null);
  const importRef = useRef<HTMLInputElement | null>(null);

  const refresh = async () => {
    if (cloudEnabled) {
      const cloud = await listCloudProjects();
      // Mirror each cloud project into the local cache so the editor can open it.
      cloud.forEach((c) => putProject(c.project));
      setProjects(cloud.map((c) => c.summary));
      setMeta(
        Object.fromEntries(
          cloud.map((c) => [c.summary.id, { sharedWithMe: c.sharedWithMe, updatedByEmail: c.updatedByEmail }])
        )
      );
    } else {
      setProjects(listProjects());
    }
  };

  useEffect(() => {
    (async () => {
      await migrateLegacy();
      await refresh();
      setMounted(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudEnabled]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? projects.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.title.toLowerCase().includes(q) ||
            p.artist.toLowerCase().includes(q)
        )
      : projects;
    const sorted = [...filtered];
    if (sort === "recent") sorted.sort((a, b) => b.updatedAt - a.updatedAt);
    if (sort === "created") sorted.sort((a, b) => b.createdAt - a.createdAt);
    if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    return sorted;
  }, [projects, query, sort]);

  const open = (id: string) => router.push(`/editor/${id}`);

  const handleCreate = async (name: string) => {
    const project = createProject(name);
    if (cloudEnabled) await saveCloudProject(project);
    open(project.id);
  };

  const handleImport = async (file: File) => {
    try {
      const project = normalizeProject(JSON.parse(await file.text()), file.name.replace(/\.[^.]+$/, ""));
      if (!project) {
        alert("That file isn't a valid Pace Lyrics project.");
        return;
      }
      putProject(project);
      if (cloudEnabled) await saveCloudProject(project);
      await refresh();
    } catch {
      alert("Could not read that project file.");
    }
  };

  return (
    <div className="mx-auto min-h-dvh w-full max-w-6xl px-8 py-10">
      {/* tool header */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-surface-2)] ring-1 ring-[var(--color-line)]">
            <AudioLines className="h-6 w-6 text-[var(--color-accent)]" strokeWidth={1.75} />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-[var(--color-ink)]">
              Pace Lyrics
            </h1>
            <p className="text-sm text-[var(--color-ink-subtle)]">Karaoke timing studio</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="secondary" onClick={() => importRef.current?.click()}>
            <FileUp className="h-4 w-4" /> Import
          </Button>
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> New project
          </Button>
        </div>
      </div>

      {/* controls */}
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-ink-subtle)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects…"
            className="h-10 w-full rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-surface)] pl-9 pr-3 text-sm text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-subtle)] focus-visible:border-[var(--color-accent)]"
          />
        </div>
        <div className="flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-surface)] p-0.5">
          {(
            [
              ["recent", "Recent"],
              ["name", "Name"],
              ["created", "Created"],
            ] as [SortKey, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSort(key)}
              className={cn(
                "rounded-[var(--radius-xs)] px-3 py-1.5 text-xs font-medium transition-colors",
                sort === key
                  ? "bg-[var(--color-surface-2)] text-[var(--color-ink)]"
                  : "text-[var(--color-ink-subtle)] hover:text-[var(--color-ink)]"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* grid */}
      <div className="mt-6">
        {!mounted ? null : visible.length === 0 ? (
          <EmptyState hasProjects={projects.length > 0} onCreate={() => setCreateOpen(true)} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <AnimatePresence mode="popLayout">
              {visible.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  onOpen={() => open(p.id)}
                  onRename={() => setRenameTarget(p)}
                  onDuplicate={async () => {
                    const copy = await duplicateProject(p.id);
                    if (copy && cloudEnabled) await pushProjectWithAssets(copy);
                    await refresh();
                  }}
                  shared={meta[p.id]?.sharedWithMe ?? false}
                  updatedByEmail={meta[p.id]?.updatedByEmail ?? null}
                  onDelete={() => setDeleteTarget(p)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <input
        ref={importRef}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void handleImport(file);
        }}
      />

      <NameDialog
        open={createOpen}
        title="New project"
        description="Give your karaoke project a name. You can rename it any time."
        confirmLabel="Create & open"
        initial=""
        onClose={() => setCreateOpen(false)}
        onConfirm={(name) => {
          setCreateOpen(false);
          handleCreate(name);
        }}
      />

      <NameDialog
        open={!!renameTarget}
        title="Rename project"
        confirmLabel="Save name"
        initial={renameTarget?.name ?? ""}
        onClose={() => setRenameTarget(null)}
        onConfirm={async (name) => {
          if (renameTarget) {
            renameProject(renameTarget.id, name);
            if (cloudEnabled) {
              const p = getProject(renameTarget.id);
              if (p) await saveCloudProject(p);
            }
          }
          setRenameTarget(null);
          await refresh();
        }}
      />

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete project"
        description={`“${deleteTarget?.name}” and its audio will be permanently removed from this browser.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (deleteTarget) {
                  await deleteProject(deleteTarget.id);
                  if (cloudEnabled) await deleteCloudProject(deleteTarget.id);
                }
                setDeleteTarget(null);
                await refresh();
              }}
            >
              Delete permanently
            </Button>
          </>
        }
      >
        <p className="text-sm text-[var(--color-ink-muted)]">This action cannot be undone.</p>
      </Modal>
    </div>
  );
}

function ProjectCard({
  project,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
  shared = false,
  updatedByEmail = null,
}: {
  project: ProjectSummary;
  onOpen: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  shared?: boolean;
  updatedByEmail?: string | null;
}) {
  const pct = project.lineCount ? (project.timedLineCount / project.lineCount) * 100 : 0;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.2 }}
      className="group relative overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] transition-colors hover:border-[var(--color-line-strong)]"
    >
      <button onClick={onOpen} className="block w-full text-left" aria-label={`Open ${project.name}`}>
        {/* banner */}
        <div className="relative flex h-24 items-center justify-center overflow-hidden bg-gradient-to-br from-[var(--color-surface-2)] to-[var(--color-elevated)]">
          <div className="absolute inset-0 bg-[radial-gradient(400px_120px_at_30%_0%,rgba(56,189,248,0.18),transparent_70%)]" />
          {shared && (
            <span className="absolute left-3 top-2 flex items-center gap-1 rounded-[var(--radius-xs)] bg-[color-mix(in_srgb,var(--color-accent)_18%,transparent)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-accent)]">
              <Users className="h-3 w-3" /> Shared
            </span>
          )}
          <AudioLines className="h-8 w-8 text-[var(--color-accent)] opacity-80" strokeWidth={1.5} />
          {project.audioDuration != null && (
            <span className="absolute bottom-2 right-3 font-mono text-[11px] tabular-nums text-[var(--color-ink-subtle)]">
              {formatShort(project.audioDuration)}
            </span>
          )}
        </div>

        <div className="p-4">
          <p className="truncate text-[15px] font-semibold text-[var(--color-ink)]">{project.name}</p>
          <p className="mt-0.5 truncate text-xs text-[var(--color-ink-subtle)]">
            {project.title ? `${project.title}${project.artist ? ` · ${project.artist}` : ""}` : "No song details"}
          </p>

          <div className="mt-3 flex items-center gap-1.5 text-xs text-[var(--color-ink-subtle)]">
            <Music className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{project.audioFileName ?? "No audio"}</span>
          </div>

          {/* timing progress */}
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-[11px] text-[var(--color-ink-subtle)]">
              <span>
                {project.timedLineCount}/{project.lineCount} lines timed
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {relativeDate(project.updatedAt)}
              </span>
            </div>
            {updatedByEmail && (
              <p className="mb-1 truncate text-[10px] text-[var(--color-ink-subtle)]">
                Last edited by {updatedByEmail}
              </p>
            )}
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-2)]">
              <div
                className="h-full rounded-full bg-[var(--color-accent)]"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </div>
      </button>

      {/* card menu */}
      <div className="absolute right-2 top-2">
        <Menu
          trigger={
            <span className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-bg)]/60 text-[var(--color-ink-muted)] opacity-0 backdrop-blur transition-opacity hover:text-[var(--color-ink)] group-hover:opacity-100">
              <Pencil className="h-3.5 w-3.5" />
            </span>
          }
          items={[
            { label: "Rename", icon: <Pencil className="h-4 w-4" />, onClick: onRename },
            { label: "Duplicate", icon: <Copy className="h-4 w-4" />, onClick: onDuplicate },
            "divider",
            { label: "Delete", icon: <Trash2 className="h-4 w-4" />, onClick: onDelete, danger: true },
          ]}
        />
      </div>
    </motion.div>
  );
}

function EmptyState({ hasProjects, onCreate }: { hasProjects: boolean; onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[var(--radius-xl)] border border-dashed border-[var(--color-line-strong)] px-6 py-20 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-surface-2)] ring-1 ring-[var(--color-line)]">
        <AudioLines className="h-7 w-7 text-[var(--color-accent)]" />
      </div>
      <p className="text-lg font-medium text-[var(--color-ink)]">
        {hasProjects ? "No matching projects" : "Create your first project"}
      </p>
      <p className="mt-1 max-w-sm text-sm text-[var(--color-ink-subtle)]">
        {hasProjects
          ? "Try a different search term."
          : "Start a project, import an MP3, and build perfectly timed karaoke."}
      </p>
      {!hasProjects && (
        <Button variant="primary" className="mt-5" onClick={onCreate}>
          <Plus className="h-4 w-4" /> New project
        </Button>
      )}
    </div>
  );
}

function NameDialog({
  open,
  title,
  description,
  confirmLabel,
  initial,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  initial: string;
  onClose: () => void;
  onConfirm: (name: string) => void;
}) {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    if (open) setValue(initial);
  }, [open, initial]);

  const submit = () => onConfirm(value.trim() || "Untitled Project");

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="Project name"
        className="h-11 w-full rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-bg)] px-3 text-sm text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-subtle)] focus-visible:border-[var(--color-accent)]"
      />
    </Modal>
  );
}

function relativeDate(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
