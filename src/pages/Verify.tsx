import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Shell } from '../components/Shell';
import { useI18n } from '../i18n';
import type { Api, VerifyResult } from '../lib/api';
import { datePhrase } from '../lib/datePhrase';
import './Register.css';
import './Verify.css';

type View = { kind: 'idle' } | { kind: 'checking' } | { kind: 'done'; result: VerifyResult } | { kind: 'error' };

const clean = (s: string) => s.trim().toUpperCase().slice(0, 64);

/** Public page behind the QR code on printed certificates: /verify?s=SERIAL. */
export function Verify({ api }: { api: Pick<Api, 'verifyCertificate'> }) {
  const { t, lang } = useI18n();
  const [serial, setSerial] = useState(() => clean(new URLSearchParams(window.location.search).get('s') ?? ''));
  const [view, setView] = useState<View>({ kind: 'idle' });

  const check = useCallback(
    async (s: string) => {
      if (!s) return;
      setView({ kind: 'checking' });
      try {
        setView({ kind: 'done', result: await api.verifyCertificate(s) });
      } catch {
        setView({ kind: 'error' });
      }
    },
    [api],
  );

  // A scanned QR code opens the page with the serial already in the link.
  useEffect(() => {
    const s = clean(new URLSearchParams(window.location.search).get('s') ?? '');
    if (s) void check(s);
  }, [check]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const s = clean(serial);
    if (!s) return;
    setSerial(s);
    window.history.replaceState({}, '', `${window.location.pathname}?s=${encodeURIComponent(s)}`);
    void check(s);
  };

  const result = view.kind === 'done' ? view.result : null;

  return (
    <Shell>
      <section className="reg-hero verify-hero">
        <h1 className="reg-title">{t('verify.title')}</h1>
        <p className="reg-meta">{t('verify.intro')}</p>
      </section>

      {result?.status === 'valid' && (
        <section className="reg-card verify-card verify-card--ok">
          <p className="verify-badge" role="status">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="11" />
              <path d="M7 12.5l3.2 3.2L17 9" />
            </svg>
            {t('verify.valid')}
          </p>
          <p className="verify-note">{t('verify.validNote')}</p>
          <dl className="verify-facts">
            <div>
              <dt>{t('verify.name')}</dt>
              <dd className="verify-name">{result.name}</dd>
            </div>
            <div>
              <dt>{t('verify.role')}</dt>
              <dd>{t(result.role === 'researcher' ? 'verify.role.researcher' : 'verify.role.attendee')}</dd>
            </div>
            <div>
              <dt>{t('verify.event')}</dt>
              <dd>{lang === 'en' ? result.event_en : result.event_ar}</dd>
            </div>
            <div>
              <dt>{t('verify.date')}</dt>
              <dd>{datePhrase(result.date_from, result.date_to, lang)}</dd>
            </div>
            <div>
              <dt>{t('verify.number')}</dt>
              <dd className="num verify-serial" dir="ltr">{result.serial}</dd>
            </div>
          </dl>
        </section>
      )}

      {(result?.status === 'not_found' || result?.status === 'rate_limited' || view.kind === 'error') && (
        <section className="reg-card verify-card verify-card--bad" role="alert">
          <p className="verify-badge">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="11" />
              <path d="M8.5 8.5l7 7M15.5 8.5l-7 7" />
            </svg>
            {result?.status === 'not_found'
              ? t('verify.notFound')
              : result?.status === 'rate_limited'
                ? t('verify.busy')
                : t('verify.error')}
          </p>
          {result?.status === 'not_found' && <p className="verify-note">{t('verify.notFoundNote')}</p>}
        </section>
      )}

      <form className="reg-card verify-form" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="v-serial">{t('verify.serial')}</label>
          <input
            id="v-serial"
            dir="ltr"
            className="num"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="ALF26-XXXX-XXXX-XXXX"
            value={serial}
            onChange={(e) => setSerial(e.target.value)}
          />
        </div>
        <button type="submit" className="btn-primary btn-block" disabled={view.kind === 'checking'}>
          {view.kind === 'checking' ? t('verify.checking') : t('verify.check')}
        </button>
      </form>
    </Shell>
  );
}
