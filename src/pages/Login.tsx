import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Shell } from '../components/Shell';
import { useI18n } from '../i18n';
import './Staff.css';

export function homeFor(role: string | null, aal: string): string {
  if (role === 'doctor') return '/researchers';
  if (role === 'admin' || role === 'owner') return aal === 'aal2' ? '/admin' : '/staff/mfa';
  return '/staff/login';
}

export function Login() {
  const { t } = useI18n();
  const { session, role, aal, signIn, signOut } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const idle = new URLSearchParams(location.search).get('idle') === '1';

  if (session && role) return <Navigate to={homeFor(role, aal)} replace />;
  if (session && !role) {
    return (
      <Shell variant="staff">
        <div className="staff-card">
          <p className="staff-error" role="alert">
            {t('staff.noAccess')}
          </p>
          <button type="button" className="btn-primary" onClick={() => void signOut()}>
            {t('staff.signOut')}
          </button>
        </div>
      </Shell>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(false);
    const res = await signIn(email, password);
    setBusy(false);
    if (!res.ok) setError(true);
  }

  return (
    <Shell variant="staff">
      <form className="staff-card" onSubmit={submit}>
        <h1>{t('staff.login')}</h1>
        {idle && <p className="staff-note">{t('staff.idle')}</p>}
        <label htmlFor="s-email">{t('staff.email')}</label>
        <input id="s-email" type="email" autoComplete="username" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label htmlFor="s-password">{t('staff.password')}</label>
        <input
          id="s-password"
          type="password"
          autoComplete="current-password"
          dir="ltr"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && (
          <p className="staff-error" role="alert">
            {t('staff.badLogin')}
          </p>
        )}
        <button type="submit" className="btn-primary" disabled={busy}>
          {t('staff.signIn')}
        </button>
      </form>
    </Shell>
  );
}
