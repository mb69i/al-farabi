import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Role = 'owner' | 'admin' | 'doctor';
export type Aal = 'aal1' | 'aal2';

export type AuthState = {
  loading: boolean;
  session: Session | null;
  role: Role | null;
  aal: Aal;
  email: string | null;
  signIn: (email: string, password: string) => Promise<{ ok: boolean }>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

type Who = { role: Role | null; aal: Aal; email: string | null };

/** Role comes from the whoami() RPC; the database itself enforces aal2 for admin work. */
export function AuthProvider({ client, children }: { client: SupabaseClient; children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [who, setWho] = useState<Who>({ role: null, aal: 'aal1', email: null });
  const [loading, setLoading] = useState(true);

  const loadWho = useCallback(
    async (s: Session | null) => {
      if (!s) {
        setWho({ role: null, aal: 'aal1', email: null });
        return;
      }
      const [{ data }, aal] = await Promise.all([
        client.rpc('whoami'),
        client.auth.mfa.getAuthenticatorAssuranceLevel(),
      ]);
      const info = (data ?? {}) as { role?: Role | null; email?: string | null };
      setWho({
        role: info.role ?? null,
        aal: aal.data?.currentLevel === 'aal2' ? 'aal2' : 'aal1',
        email: info.email ?? s.user.email ?? null,
      });
    },
    [client],
  );

  useEffect(() => {
    let alive = true;
    client.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      setSession(data.session);
      await loadWho(data.session).catch(() => undefined);
      if (alive) setLoading(false);
    });
    const { data: sub } = client.auth.onAuthStateChange((_event, s) => {
      // Defer the RPC: calling Supabase inside this callback can deadlock the auth lock.
      // The session is set only after the role is known, so screens never see a session without its role.
      setTimeout(() => {
        void loadWho(s)
          .catch(() => undefined)
          .then(() => setSession(s));
      }, 0);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [client, loadWho]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { data, error } = await client.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (error || !data.session) return { ok: false };
      await loadWho(data.session);
      setSession(data.session);
      return { ok: true };
    },
    [client, loadWho],
  );

  const signOut = useCallback(async () => {
    await client.auth.signOut();
    setSession(null);
    setWho({ role: null, aal: 'aal1', email: null });
  }, [client]);

  const refresh = useCallback(async () => {
    const { data } = await client.auth.getSession();
    setSession(data.session);
    await loadWho(data.session);
  }, [client, loadWho]);

  const value = useMemo<AuthState>(
    () => ({ loading, session, role: who.role, aal: who.aal, email: who.email, signIn, signOut, refresh }),
    [loading, session, who, signIn, signOut, refresh],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
