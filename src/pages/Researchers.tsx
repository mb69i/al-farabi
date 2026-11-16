import { useEffect, useRef, useState } from 'react';
import { SignaturePad } from '../components/SignaturePad';
import { useI18n, type Key } from '../i18n';
import type { SignoffResult } from '../lib/signoff';
import type { ResearcherRow } from '../lib/staffApi';
import './Researchers.css';

type Props = {
  search: (q: string) => Promise<ResearcherRow[]>;
  submit: (r: ResearcherRow, png: Blob, strokes: unknown) => Promise<SignoffResult>;
};

type Outcome = { kind: 'ok' | 'error'; key: Key } | null;

const RESULT_KEY: Record<SignoffResult['status'], Key> = {
  signed: 'res.done',
  already_signed: 'res.alreadySigned',
  certificates_paused: 'res.paused',
};

export function Researchers({ search, submit }: Props) {
  const { t, lang } = useI18n();
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<ResearcherRow[] | null>(null);
  const [picked, setPicked] = useState<ResearcherRow | null>(null);
  const [strokes, setStrokes] = useState(0);
  const getters = useRef<{ png: () => Promise<Blob>; data: () => unknown } | null>(null);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const [outcome, setOutcome] = useState<Outcome>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setRows(null);
      return;
    }
    let alive = true;
    const id = window.setTimeout(() => {
      search(q)
        .then((r) => alive && setRows(r))
        .catch(() => alive && setRows([]));
    }, 250);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
  }, [query, search]);

  function reset() {
    setPicked(null);
    setStrokes(0);
    getters.current = null;
    setOutcome(null);
  }

  async function confirm() {
    if (!picked || !getters.current || inFlight.current || strokes < 2) return;
    inFlight.current = true;
    setSaving(true);
    setOutcome(null);
    try {
      const res = await submit(picked, await getters.current.png(), getters.current.data());
      setOutcome({ kind: 'ok', key: RESULT_KEY[res.status] ?? 'res.done' });
      window.setTimeout(() => {
        reset();
        setQuery('');
      }, 4000);
    } catch {
      setOutcome({ kind: 'error', key: 'res.failed' });
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  const primaryName = (r: ResearcherRow) => (lang === 'en' && r.name_en ? r.name_en : r.name_ar);
  const secondaryName = (r: ResearcherRow) => (lang === 'en' ? (r.name_en ? r.name_ar : null) : r.name_en);

  if (picked) {
    const done = outcome?.kind === 'ok';
    return (
      <section className="res-sign">
        <button type="button" className="res-back" onClick={reset} disabled={saving}>
          {t('res.back')}
        </button>
        <div className="res-detail">
          <h2>{primaryName(picked)}</h2>
          {secondaryName(picked) && <p className="res-alt">{secondaryName(picked)}</p>}
          <dl>
            <dt>{t('res.institution')}</dt>
            <dd>{picked.institution || '—'}</dd>
            <dt>{t('res.researchTitle')}</dt>
            <dd>{picked.research_title}</dd>
          </dl>
        </div>
        {!done && (
          <SignaturePad
            hint={t('res.signHere')}
            clearLabel={t('res.clear')}
            onChange={(n, png, data) => {
              setStrokes(n);
              getters.current = { png, data };
            }}
          />
        )}
        {outcome && (
          <p className={`res-outcome res-outcome--${outcome.kind}`} role={outcome.kind === 'error' ? 'alert' : 'status'}>
            {t(outcome.key)}
          </p>
        )}
        {!done && (
          <button type="button" className="btn-primary res-confirm" disabled={saving || strokes < 2} onClick={confirm}>
            {saving ? t('res.saving') : t('res.confirm')}
          </button>
        )}
      </section>
    );
  }

  return (
    <section className="res-search">
      <h1>{t('res.title')}</h1>
      <label htmlFor="res-q" className="sr-only">
        {t('res.search')}
      </label>
      <input
        id="res-q"
        className="res-input"
        type="search"
        autoComplete="off"
        placeholder={`${t('res.search')} — ${t('res.searchHint')}`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label={t('res.search')}
      />
      {rows && rows.length === 0 && <p className="res-empty">{t('res.noResults')}</p>}
      {rows && rows.length > 0 && (
        <ul className="res-list">
          {rows.map((r) => (
            <li key={r.id}>
              <button type="button" className="res-row" disabled={r.signed} onClick={() => setPicked(r)}>
                <span className="res-row-name">{primaryName(r)}</span>
                {secondaryName(r) && <span className="res-row-alt">{secondaryName(r)}</span>}
                <span className="res-row-meta">
                  {r.institution} · {r.research_title}
                </span>
                {r.signed && <span className="res-badge">{t('res.signed')}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
