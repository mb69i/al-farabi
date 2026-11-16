import type { SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Shell } from '../components/Shell';
import { useI18n } from '../i18n';
import './Staff.css';

/** First visit: enrol a TOTP authenticator (QR). Later visits: just ask for the 6-digit code. */
export function MfaSetup({ client }: { client: SupabaseClient }) {
  const { t } = useI18n();
  const { session, role, aal, refresh } = useAuth();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    (async () => {
      const { data } = await client.auth.mfa.listFactors();
      const verified = data?.totp?.find((f) => f.status === 'verified');
      if (verified) {
        if (alive) setFactorId(verified.id);
        return;
      }
      // Remove half-finished enrolments so a fresh QR can be issued.
      for (const f of data?.all ?? []) {
        if (f.factor_type === 'totp' && f.status !== 'verified') await client.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data: enrolled } = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Al-Farabi admin' });
      if (alive && enrolled) {
        setFactorId(enrolled.id);
        setQr(enrolled.totp.qr_code);
      }
    })().catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [client, session]);

  if (!session) return <Navigate to="/staff/login" replace />;
  if (aal === 'aal2' && (role === 'admin' || role === 'owner')) return <Navigate to="/admin" replace />;

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (!factorId || busy) return;
    setBusy(true);
    setError(false);
    const { error: err } = await client.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
    if (err) {
      setError(true);
      setBusy(false);
      return;
    }
    await refresh();
    setBusy(false);
  }

  return (
    <Shell variant="staff">
      <form className="staff-card" onSubmit={verify}>
        <h1>{t('staff.mfaTitle')}</h1>
        <p className="staff-note">{qr ? t('staff.mfaSetup') : t('staff.mfaPrompt')}</p>
        {qr && <img className="mfa-qr" src={qr} alt="" width={200} height={200} />}
        <label htmlFor="s-code">{t('staff.mfaCode')}</label>
        <input
          id="s-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          dir="ltr"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          required
        />
        {error && (
          <p className="staff-error" role="alert">
            {t('staff.badCode')}
          </p>
        )}
        <button type="submit" className="btn-primary" disabled={busy || code.length !== 6}>
          {t('staff.verify')}
        </button>
      </form>
    </Shell>
  );
}
