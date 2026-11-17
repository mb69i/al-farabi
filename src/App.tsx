import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { RequireRole } from './auth/RequireRole';
import { api } from './lib/apiInstance';
import { EVENT_SLUG, supabase } from './lib/supabase';
import { Display } from './pages/Display';
import { Login } from './pages/Login';
import { MfaSetup } from './pages/MfaSetup';
import { Register } from './pages/Register';
import { ContactProvider } from './components/SiteFooter';

const Staff = lazy(() => import('./staffRoutes'));

function NeedsBackend({ children }: { children: ReactNode }) {
  if (!supabase) return <p style={{ padding: 32, textAlign: 'center' }}>Supabase is not configured for this build.</p>;
  return <AuthProvider client={supabase}>{children}</AuthProvider>;
}

export default function App() {
  return (
    <ContactProvider load={api.getSiteContact}>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Register api={api} slug={EVENT_SLUG} />} />
        <Route path="/display" element={<Display api={api} slug={EVENT_SLUG} />} />
        <Route path="/staff/login" element={<NeedsBackend><Login /></NeedsBackend>} />
        <Route path="/staff/mfa" element={<NeedsBackend><MfaSetup client={supabase!} /></NeedsBackend>} />
        <Route
          path="/researchers/*"
          element={
            <NeedsBackend>
              <RequireRole roles={['doctor', 'admin', 'owner']}>
                <Suspense fallback={null}>
                  <Staff area="researchers" />
                </Suspense>
              </RequireRole>
            </NeedsBackend>
          }
        />
        <Route
          path="/admin/*"
          element={
            <NeedsBackend>
              <RequireRole roles={['admin', 'owner']}>
                <Suspense fallback={null}>
                  <Staff area="admin" />
                </Suspense>
              </RequireRole>
            </NeedsBackend>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
    </ContactProvider>
  );
}
