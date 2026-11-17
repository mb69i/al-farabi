import { lazy, Suspense } from 'react';
import { AuthProvider } from './auth/AuthProvider';
import { RequireRole } from './auth/RequireRole';
import { supabase } from './lib/supabase';
import { Login } from './pages/Login';
import { MfaSetup } from './pages/MfaSetup';

const StaffRoutes = lazy(() => import('./staffRoutes'));

export type StaffPage = 'login' | 'mfa' | 'researchers' | 'admin';

/**
 * Everything behind a staff sign-in. Loaded on demand, so the public registration page never
 * downloads supabase-js, the auth screens or the admin tools.
 */
export default function StaffApp({ page }: { page: StaffPage }) {
  if (!supabase) return <p style={{ padding: 32, textAlign: 'center' }}>Supabase is not configured for this build.</p>;
  return (
    <AuthProvider client={supabase}>
      {page === 'login' && <Login />}
      {page === 'mfa' && <MfaSetup client={supabase} />}
      {(page === 'researchers' || page === 'admin') && (
        <RequireRole roles={page === 'researchers' ? ['doctor', 'admin', 'owner'] : ['admin', 'owner']}>
          <Suspense fallback={null}>
            <StaffRoutes area={page} />
          </Suspense>
        </RequireRole>
      )}
    </AuthProvider>
  );
}
