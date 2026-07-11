"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { isCloudEnabled, supabase } from "@/lib/supabase";
import { AuthScreen } from "./AuthScreen";

interface AuthContextValue {
  cloudEnabled: boolean;
  ready: boolean;
  userId: string | null;
  email: string | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  cloudEnabled: false,
  ready: true,
  userId: null,
  email: null,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

/**
 * Gates the whole app behind sign-in when cloud sync is configured. When it
 * isn't (no env keys), it's a transparent pass-through — the app stays fully
 * local, exactly as before.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(!isCloudEnabled);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setUserId(data.session?.user?.id ?? null);
      setEmail(data.session?.user?.email ?? null);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
      setEmail(session?.user?.email ?? null);
      setReady(true);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value: AuthContextValue = {
    cloudEnabled: isCloudEnabled,
    ready,
    userId,
    email,
    signOut: async () => {
      await supabase?.auth.signOut();
    },
  };

  let content: React.ReactNode = children;
  if (isCloudEnabled) {
    if (!ready) content = <AuthSplash />;
    else if (!userId) content = <AuthScreen />;
  }

  return <AuthContext.Provider value={value}>{content}</AuthContext.Provider>;
}

function AuthSplash() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-line-strong)] border-t-[var(--color-accent)]" />
    </div>
  );
}
