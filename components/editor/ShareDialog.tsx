"use client";

import { useEffect, useState } from "react";
import { Loader2, Mail, UserPlus, X } from "lucide-react";
import { addShare, listShares, removeShare } from "@/lib/cloud";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";

/**
 * Invite a collaborator to a project by email. They'll see it on their
 * dashboard after signing in with that same email. Only the owner can manage
 * sharing (enforced server-side by Row Level Security).
 */
export function ShareDialog({
  open,
  onClose,
  projectId,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
}) {
  const [emails, setEmails] = useState<string[]>([]);
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !projectId) return;
    setError(null);
    setLoading(true);
    listShares(projectId)
      .then(setEmails)
      .finally(() => setLoading(false));
  }, [open, projectId]);

  const invite = async () => {
    setError(null);
    setBusy(true);
    const res = await addShare(projectId, value);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Couldn't add that collaborator.");
      return;
    }
    setValue("");
    setEmails(await listShares(projectId));
  };

  const revoke = async (email: string) => {
    setEmails((prev) => prev.filter((e) => e !== email));
    await removeShare(projectId, email);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Share project"
      description="Invite a collaborator by email. They sign in with that email and pick up where you left off."
      footer={
        <Button variant="secondary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-ink-subtle)]" />
          <input
            type="email"
            value={value}
            placeholder="collaborator@email.com"
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !busy && invite()}
            className="h-10 w-full rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-bg)] pl-9 pr-3 text-sm text-[var(--color-ink)] outline-none focus-visible:border-[var(--color-accent)]"
          />
        </div>
        <Button variant="primary" onClick={invite} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          Invite
        </Button>
      </div>

      {error && (
        <p className="mt-2 text-sm text-[var(--color-danger)]" role="alert">
          {error}
        </p>
      )}

      <div className="mt-4">
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-[var(--color-ink-subtle)]">
          People with access
        </p>
        {loading ? (
          <p className="text-sm text-[var(--color-ink-subtle)]">Loading…</p>
        ) : emails.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-subtle)]">
            Only you, for now. Invite someone above.
          </p>
        ) : (
          <ul className="space-y-1">
            {emails.map((email) => (
              <li
                key={email}
                className="flex items-center justify-between rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-ink)]"
              >
                <span className="truncate">{email}</span>
                <button
                  onClick={() => revoke(email)}
                  aria-label={`Remove ${email}`}
                  className="ml-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-xs)] text-[var(--color-ink-subtle)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-danger)]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
