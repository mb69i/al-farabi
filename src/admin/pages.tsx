import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import type { AdminResearcher, Delivery, Guest, Overview as OverviewData, Page } from './adminApi';
import { Stat, useAdminApi } from './AdminLayout';
import { parseResearcherSheet, type ImportError, type ResearcherImportRow } from './importResearchers';
import { ContactForm } from './ContactForm';
import { HallTheme, type HallThemeValue } from './HallTheme';
import { Switches, type SwitchState } from './Switches';

const PAGE = 50;

function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, deps);
  const reload = useCallback(() => {
    setError(null);
    run().then(setData).catch((e: Error) => setError(e.message));
  }, [run]);
  useEffect(reload, [reload]);
  return { data, error, reload, setData };
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? (
    <p className="admin-error" role="alert">
      {error}
    </p>
  ) : null;
}

/* ---------- Overview ---------- */
export function Overview() {
  const { t } = useI18n();
  const api = useAdminApi();
  const { data, error } = useLoad<OverviewData>(() => api.overview(), [api]);
  useEffect(() => {
    const id = window.setInterval(() => api.overview().catch(() => undefined), 15000);
    return () => window.clearInterval(id);
  }, [api]);
  return (
    <>
      <h1 className="admin-h1">{t('admin.overview')}</h1>
      <ErrorLine error={error} />
      {data && (
        <>
          <div className="stats">
            <Stat label={t('display.total')} value={data.total} />
            <Stat label={t('display.today')} value={data.present_today} />
            <Stat label={t('display.male')} value={data.male} />
            <Stat label={t('display.female')} value={data.female} />
            <Stat label={t('display.vip')} value={data.vip} tone="gold" />
            <Stat label={t('display.researchers')} value={`${data.researchers_signed} / ${data.researchers_total}`} tone="burgundy" />
          </div>
          <h2 className="admin-h2">{t('admin.deliveries')}</h2>
          <table className="admin-table">
            <tbody>
              {data.deliveries.map((d) => (
                <tr key={`${d.kind}-${d.status}`}>
                  <td>{t(d.kind === 'card' ? 'admin.card' : 'admin.certificate')}</td>
                  <td>
                    <span className={`pill pill--${d.status}`}>{d.status}</span>
                  </td>
                  <td className="num">{d.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}

/* ---------- Guests ---------- */
export function Guests() {
  const { t } = useI18n();
  const api = useAdminApi();
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const { data, error, reload } = useLoad<Page<Guest>>(() => api.listGuests(search, PAGE, offset), [api, search, offset]);
  const [editing, setEditing] = useState<Guest | null>(null);

  async function remove(g: Guest) {
    if (!window.confirm(`${t('admin.confirmDelete')}\n${g.full_name}`)) return;
    await api.deleteGuest(g.id);
    reload();
  }

  return (
    <>
      <h1 className="admin-h1">{t('admin.guests')}</h1>
      <input
        className="admin-search"
        type="search"
        placeholder={t('admin.search')}
        aria-label={t('admin.search')}
        value={search}
        onChange={(e) => {
          setOffset(0);
          setSearch(e.target.value);
        }}
      />
      <ErrorLine error={error} />
      {editing && (
        <GuestEditor
          guest={editing}
          onClose={() => setEditing(null)}
          onSave={async (patch) => {
            await api.updateGuest(editing.id, patch);
            setEditing(null);
            reload();
          }}
        />
      )}
      {data && (
        <>
          <p className="admin-count">
            {t('admin.rows')}: <span className="num">{data.total}</span>
          </p>
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t('reg.fullName')}</th>
                  <th>{t('reg.phone')}</th>
                  <th>{t('reg.email')}</th>
                  <th>{t('reg.type')}</th>
                  <th>{t('reg.workplace')}</th>
                  <th>{t('admin.vip')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.rows.map((g) => (
                  <tr key={g.id}>
                    <td>
                      <strong>{g.full_name}</strong>
                      <div className="cell-sub num">{g.serial}</div>
                    </td>
                    <td className="num">{g.phone}</td>
                    <td dir="ltr">{g.email}</td>
                    <td>{g.guest_type ? t(`reg.${g.guest_type}` as const) : '—'}</td>
                    <td>{g.workplace}</td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`${t('admin.vip')} ${g.full_name}`}
                        checked={g.is_vip}
                        onChange={async (e) => {
                          await api.setVip('guest', g.id, e.target.checked);
                          reload();
                        }}
                      />
                    </td>
                    <td className="row-actions">
                      <button type="button" onClick={() => setEditing(g)}>
                        {t('admin.edit')}
                      </button>
                      <button type="button" className="danger" onClick={() => void remove(g)}>
                        {t('admin.delete')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager total={data.total} offset={offset} onChange={setOffset} />
        </>
      )}
    </>
  );
}

function GuestEditor({ guest, onSave, onClose }: { guest: Guest; onSave: (p: Partial<Guest>) => Promise<void>; onClose: () => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState(guest);
  const field = (k: 'full_name' | 'phone' | 'email' | 'workplace' | 'specialization', label: string) => (
    <label>
      {label}
      <input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
    </label>
  );
  return (
    <div className="admin-panel">
      {field('full_name', t('reg.fullName'))}
      {field('phone', t('reg.phone'))}
      {field('email', t('reg.email'))}
      {field('workplace', t('reg.workplace'))}
      {field('specialization', t('reg.specialization'))}
      <div className="row-actions">
        <button
          type="button"
          className="btn-primary"
          onClick={() =>
            void onSave({
              full_name: form.full_name, phone: form.phone, email: form.email,
              workplace: form.workplace, specialization: form.specialization,
            })
          }
        >
          {t('admin.save')}
        </button>
        <button type="button" className="btn-ghost" onClick={onClose}>
          {t('admin.cancel')}
        </button>
      </div>
    </div>
  );
}

function Pager({ total, offset, onChange }: { total: number; offset: number; onChange: (o: number) => void }) {
  if (total <= PAGE) return null;
  return (
    <div className="pager">
      <button type="button" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - PAGE))}>
        ‹
      </button>
      <span className="num">
        {offset + 1}–{Math.min(total, offset + PAGE)} / {total}
      </span>
      <button type="button" disabled={offset + PAGE >= total} onClick={() => onChange(offset + PAGE)}>
        ›
      </button>
    </div>
  );
}

/* ---------- Researchers ---------- */
export function AdminResearchers() {
  const { t, lang } = useI18n();
  const api = useAdminApi();
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const { data, error, reload } = useLoad<Page<AdminResearcher>>(() => api.listResearchers(search, PAGE, offset), [api, search, offset]);
  const [preview, setPreview] = useState<{ rows: ResearcherImportRow[]; errors: ImportError[]; warnings: ImportError[] } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function onFile(f: File | undefined) {
    if (!f) return;
    setMessage(null);
    setPreview(parseResearcherSheet(await f.arrayBuffer()));
  }

  async function commit() {
    if (!preview) return;
    const r = await api.importResearchers(preview.rows);
    setMessage(`+${r.inserted} · ↻${r.updated}${r.errors.length ? ` · ✕${r.errors.length}` : ''}`);
    setPreview(null);
    reload();
  }

  async function viewSignature(path: string) {
    window.open(await api.signatureUrl(path), '_blank', 'noopener,noreferrer');
  }

  return (
    <>
      <h1 className="admin-h1">{t('admin.researchers')}</h1>
      <div className="admin-panel">
        <label className="file-btn">
          {t('admin.import')}
          <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => void onFile(e.target.files?.[0])} />
        </label>
        {message && <p className="admin-ok num">{message}</p>}
        {preview && (
          <div className="import-preview">
            <h2 className="admin-h2">{t('admin.importPreview')}</h2>
            <p className="num">
              ✓ {preview.rows.length} · ✕ {preview.errors.length} · ⚠ {preview.warnings.length}
            </p>
            {preview.warnings.length > 0 && (
              <ul className="import-errors" style={{ color: 'var(--gold-soft)' }}>
                {preview.warnings.map((w) => (
                  <li key={`w${w.row}`}>
                    <span className="num">#{w.row}</span> — {w.message} (saved without phone)
                  </li>
                ))}
              </ul>
            )}
            {preview.errors.length > 0 && (
              <ul className="import-errors">
                {preview.errors.map((e) => (
                  <li key={e.row}>
                    <span className="num">#{e.row}</span> — {e.message}
                  </li>
                ))}
              </ul>
            )}
            <button type="button" className="btn-primary" disabled={!preview.rows.length} onClick={() => void commit()}>
              {t('admin.importCommit')}
            </button>
          </div>
        )}
      </div>
      <input
        className="admin-search"
        type="search"
        placeholder={t('admin.search')}
        aria-label={t('admin.search')}
        value={search}
        onChange={(e) => {
          setOffset(0);
          setSearch(e.target.value);
        }}
      />
      <ErrorLine error={error} />
      {data && (
        <>
          <p className="admin-count">
            {t('admin.rows')}: <span className="num">{data.total}</span>
          </p>
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t('reg.fullName')}</th>
                  <th>{t('res.institution')}</th>
                  <th>{t('res.researchTitle')}</th>
                  <th>{t('res.signed')}</th>
                  <th>{t('admin.vip')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{lang === 'en' && r.name_en ? r.name_en : r.name_ar}</strong>
                      <div className="cell-sub" dir="ltr">
                        {r.email}
                      </div>
                    </td>
                    <td>{r.institution}</td>
                    <td className="cell-wide">{r.research_title}</td>
                    <td>
                      {r.signed_at ? (
                        <span className="pill pill--sent">
                          {new Date(r.signed_at).toLocaleString(lang === 'ar' ? 'ar-IQ' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' })}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`${t('admin.vip')} ${r.name_ar}`}
                        checked={r.is_vip}
                        onChange={async (e) => {
                          await api.setVip('researcher', r.id, e.target.checked);
                          reload();
                        }}
                      />
                    </td>
                    <td className="row-actions">
                      {r.signature_path && (
                        <button type="button" onClick={() => void viewSignature(r.signature_path!)}>
                          {t('admin.viewSignature')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager total={data.total} offset={offset} onChange={setOffset} />
        </>
      )}
    </>
  );
}

/* ---------- Deliveries ---------- */
const STATUSES = ['', 'queued', 'sending', 'sent', 'failed', 'waiting_template', 'disabled'];

export function Deliveries() {
  const { t } = useI18n();
  const api = useAdminApi();
  const [status, setStatus] = useState('');
  const [offset, setOffset] = useState(0);
  const { data, error, reload } = useLoad<Page<Delivery>>(() => api.listDeliveries(status, PAGE, offset), [api, status, offset]);
  return (
    <>
      <h1 className="admin-h1">{t('admin.deliveries')}</h1>
      <div className="filter-row" role="group">
        {STATUSES.map((s) => (
          <button
            key={s || 'all'}
            type="button"
            className={`chip-btn ${status === s ? 'is-active' : ''}`}
            onClick={() => {
              setOffset(0);
              setStatus(s);
            }}
          >
            {s || '∗'}
          </button>
        ))}
      </div>
      <ErrorLine error={error} />
      {data && (
        <>
          <div className="table-wrap">
            <table className="admin-table">
              <tbody>
                {data.rows.map((d) => (
                  <tr key={d.id}>
                    <td>{t(d.kind === 'card' ? 'admin.card' : 'admin.certificate')}</td>
                    <td>
                      <strong>{d.name}</strong>
                      <div className="cell-sub" dir="ltr">
                        {d.to_email}
                      </div>
                    </td>
                    <td>
                      <span className={`pill pill--${d.status}`}>{d.status}</span>
                      {d.last_error && <div className="cell-sub">{d.last_error}</div>}
                    </td>
                    <td className="num">{d.attempts}</td>
                    <td className="row-actions">
                      {(d.status === 'failed' || d.status === 'sent') && (
                        <button
                          type="button"
                          onClick={async () => {
                            await api.retryDelivery(d.id);
                            reload();
                          }}
                        >
                          {d.status === 'sent' ? t('admin.resend') : t('admin.retry')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager total={data.total} offset={offset} onChange={setOffset} />
        </>
      )}
    </>
  );
}

/* ---------- Switches ---------- */
export function SwitchesPage() {
  const { t } = useI18n();
  const api = useAdminApi();
  const { data, error, setData } = useLoad<SwitchState>(async () => (await api.overview()).switches, [api]);
  const hall = useLoad<HallThemeValue>(async () => (await api.overview()).theme ?? 'auto', [api]);
  return (
    <>
      <h1 className="admin-h1">{t('admin.switches')}</h1>
      <ErrorLine error={error} />
      {data && <Switches value={data} onSave={async (next) => setData(await api.setSwitches(next))} />}
      {hall.data && <HallTheme value={hall.data} onSave={(v) => api.setDisplayTheme(v)} />}
      <ContactForm load={api.getContact} save={api.setContact} />
    </>
  );
}
