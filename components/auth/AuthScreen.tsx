"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { AudioLines, Loader2, Lock, Mail } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "../ui/Button";

/**
 * Sign-in only. Accounts are provisioned by the owner in Supabase
 * (Authentication → Users) — there is intentionally no self-service sign-up.
 */
export function AuthScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!supabase) return;
    setError(null);
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
    } catch (err) {
      setError(
        err instanceof Error
          ? /invalid login credentials/i.test(err.message)
            ? "Incorrect email or password."
            : err.message
          : "Something went wrong. Try again."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm"
      >
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-surface-2)] ring-1 ring-[var(--color-line)]">
            <AudioLines className="h-6 w-6 text-[var(--color-accent)]" strokeWidth={1.75} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">
            Sign in
          </h1>
          <p className="mt-1.5 text-sm text-[var(--color-ink-muted)]">
            Sign in to reach your projects on any device.
          </p>
        </div>

        <div className="space-y-3">
          <Field
            icon={<Mail className="h-4 w-4" />}
            type="email"
            placeholder="you@email.com"
            value={email}
            autoComplete="email"
            onChange={setEmail}
            onEnter={submit}
          />
          <Field
            icon={<Lock className="h-4 w-4" />}
            type="password"
            placeholder="Password"
            value={password}
            autoComplete="current-password"
            onChange={setPassword}
            onEnter={submit}
          />

          {error && (
            <p className="text-sm text-[var(--color-danger)]" role="alert">
              {error}
            </p>
          )}

          <Button variant="primary" size="lg" className="w-full" onClick={submit} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Sign in
          </Button>
        </div>

        <p className="mt-6 text-center text-xs text-[var(--color-ink-subtle)]">
          Accounts are created by the studio owner. Ask them for access{" "}
          <a
            href="mailto:silverstonestudio.work@gmail.com"
            className="font-medium text-[var(--color-accent)] hover:underline"
          >
            silverstonestudio.work@gmail.com
          </a>
        </p>
      </motion.div>
    </div>
  );
}

function Field({
  icon,
  type,
  placeholder,
  value,
  autoComplete,
  onChange,
  onEnter,
}: {
  icon: React.ReactNode;
  type: string;
  placeholder: string;
  value: string;
  autoComplete: string;
  onChange: (v: string) => void;
  onEnter: () => void;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-subtle)]">
        {icon}
      </span>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onEnter()}
        className="h-11 w-full rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-surface)] pl-10 pr-3 text-sm text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-subtle)] focus-visible:border-[var(--color-accent)]"
      />
    </div>
  );
}
