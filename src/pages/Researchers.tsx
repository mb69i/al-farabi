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

/** A signature saving in the background (owner, 21 Nov: "make the researchers sign in faster"): the desk goes
 * straight back to the search; each save shows here, and a failed one keeps its image for "Try again". */
type Save = { row: ResearcherRow; png: Blob; strokes: unknown; state: 'saving' | 'ok' | 'error'; key: Key };

const RESULT_KEY: Record<SignoffResult['status'], Key> = {
  signed: 'res.done',
  already_signed: 'res.alreadySigned',
  certificates_paused: 'res.paused',
};

const SHOW_DONE_MS = 8000;

export function Researchers({ search, submit }: Props) {
  const { t, lang } = useI18n();
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<ResearcherRow[] | null>(null);
  const [picked, setPicked] = useState<ResearcherRow | null>(null);
  const [strokes, setStrokes] = useState(0);
  const getters = useRef<{ png: () => Promise<Blob>; data: () => unknown } | null>(null);
  const inFlight = useRef(false);
  const [saves, setSaves] = useState<Save[]>([]);

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
  }

  function update(id: string, patch: Partial<Save>) {
    setSaves((all) => all.map((s) => (s.row.id === id ? { ...s, ...patch } : s)));
  }

  function save(row: ResearcherRow, png: Blob, data: unknown) {
    setSaves((all) => [{ row, png, strokes: data, state: 'saving', key: 'res.saving' }, ...all.filter((s) => s.row.id !== row.id)]);
    submit(row, png, data)
      .then((res) => {
        update(row.id, { state: 'ok', key: RESULT_KEY[res.status] ?? 'res.done' });
        window.setTimeout(() => setSaves((all) => all.filter((s) => !(s.row.id === row.id && s.state === 'ok'))), SHOW_DONE_MS);
      })
      .catch(() => update(row.id, { state: 'error', key: 'res.failed' }));
  }

  async function confirm() {
    if (!picked || !getters.current || inFlight.current || strokes < 1) return;
    inFlight.current = true;
    try {
      const png = await getters.current.png();
      save(picked, png, getters.current.data());
      reset();
      setQuery('');
    } finally {
      inFlight.current = false;
    }
  }

  const busy = (r: ResearcherRow) => saves.some((s) => s.row.id === r.id && s.state !== 'error');
  const primaryName = (r: ResearcherRow) => (lang === 'en' && r.name_en ? r.name_en : r.name_ar);
  const secondaryName = (r: ResearcherRow) => (lang === 'en' ? (r.name_en ? r.name_ar : null) : r.name_en);
  const paperLine = (r: ResearcherRow) => [r.paper_code, r.hall].filter(Boolean).join(' · ');

  if (picked) {
    return (
      <section className="res-sign">
        <button type="button" className="res-back" onClick={reset}>
          {t('res.back')}
        </button>
        <div className="res-detail">
          <h2>{primaryName(picked)}</h2>
          {secondaryName(picked) && <p className="res-alt">{secondaryName(picked)}</p>}
          <dl>
            {picked.paper_code && (
              <>
                <dt>{t('res.paper')}</dt>
                <dd dir="ltr">{picked.paper_code}</dd>
              </>
            )}
            {picked.hall && (
              <>
                <dt>{t('res.hall')}</dt>
                <dd dir="ltr">{picked.hall}</dd>
              </>
            )}
            <dt>{t('res.institution')}</dt>
            <dd>{picked.institution || '—'}</dd>
            <dt>{t('res.researchTitle')}</dt>
            <dd>{picked.research_title}</dd>
          </dl>
        </div>
        <SignaturePad
          hint={t('res.signHere')}
          clearLabel={t('res.clear')}
          onChange={(n, png, data) => {
            setStrokes(n);
            getters.current = { png, data };
          }}
        />
        <button type="button" className="btn-primary res-confirm" disabled={strokes < 1} onClick={confirm}>
          {t('res.confirm')}
        </button>
      </section>
    );
  }

  return (
    <section className="res-search">
      <h1>{t('res.title')}</h1>
      <div className="res-saves" role="status" aria-live="polite">
        {saves.map((s) => (
          <p key={s.row.id} className={`res-save res-save--${s.state}`}>
            <span className="res-save-name">{primaryName(s.row)}</span>
            <span className="res-save-msg">{t(s.key)}</span>
            {s.state === 'error' && (
              <button type="button" className="res-retry" onClick={() => save(s.row, s.png, s.strokes)}>
                {t('res.retry')}
              </button>
            )}
          </p>
        ))}
      </div>
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
          {rows.map((r) => {
            const signed = r.signed || busy(r);
            return (
              <li key={r.id}>
                <button type="button" className="res-row" disabled={signed} onClick={() => setPicked(r)}>
                  <span className="res-row-name">{primaryName(r)}</span>
                  {secondaryName(r) && <span className="res-row-alt">{secondaryName(r)}</span>}
                  {paperLine(r) && (
                    <span className="res-row-paper" dir="ltr">
                      {paperLine(r)}
                    </span>
                  )}
                  <span className="res-row-meta">
                    {r.institution} · {r.research_title}
                  </span>
                  {signed && <span className="res-badge">{t('res.signed')}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
