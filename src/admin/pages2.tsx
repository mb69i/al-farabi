import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useI18n } from '../i18n';
import type { AuditEntry, Page, StaffMember } from './adminApi';
import { useAdminApi } from './AdminLayout';
import { downloadExport } from './exportSheet';

type Kind = 'card' | 'certificate';
type FieldCfg = {
  text: string; x: number; y: number; anchor: string; font: string; font_ar: string;
  size: number; min_size: number; max_width: number; max_lines: number; color: string;
};
type Layout = { fields: Record<string, FieldCfg> };

const FIELDS: Record<Kind, Array<{ key: string; lines: number; font: string; yRatio: number; sizeRatio: number }>> = {
  card: [
    { key: 'full_name', lines: 2, font: 'IBMPlexSansArabic-Bold.ttf', yRatio: 0.5, sizeRatio: 0.07 },
    { key: 'serial', lines: 1, font: 'IBMPlexSansArabic-Regular.ttf', yRatio: 0.72, sizeRatio: 0.04 },
  ],
  certificate: [
    { key: 'full_name', lines: 2, font: 'Amiri-Bold.ttf', yRatio: 0.45, sizeRatio: 0.06 },
    { key: 'research_title', lines: 3, font: 'IBMPlexSansArabic-Bold.ttf', yRatio: 0.62, sizeRatio: 0.032 },
    { key: 'institution', lines: 1, font: 'IBMPlexSansArabic-Regular.ttf', yRatio: 0.74, sizeRatio: 0.026 },
  ],
};

const SAMPLE = {
  full_name: 'أ.د. عبد الرحمن محمد الباقر الحسيني',
  serial: 'ALF26-K7Q2MX',
  research_title: 'تطبيقات الذكاء الاصطناعي التوليدي في تحسين جودة التعليم العالي وأثرها على مخرجات التعلم في الجامعات العراقية',
  institution: 'جامعة الفارابي — بغداد',
  event_name: 'مؤتمر الفارابي للبحوث التطبيقية في التحول الرقمي الشامل',
};

function defaultLayout(kind: Kind, w: number, h: number): Layout {
  const fields: Record<string, FieldCfg> = {};
  for (const f of FIELDS[kind]) {
    const size = Math.round(h * f.sizeRatio);
    fields[f.key] = {
      text: `{${f.key}}`, x: Math.round(w / 2), y: Math.round(h * f.yRatio), anchor: 'ms',
      font: f.font, font_ar: f.font, size, min_size: Math.max(12, Math.round(size * 0.6)),
      max_width: Math.round(w * 0.7), max_lines: f.lines, color: '#14234B',
    };
  }
  return { fields };
}

/* ---------- Template studio ---------- */
export function TemplateStudio() {
  const { t } = useI18n();
  const api = useAdminApi();
  const [kind, setKind] = useState<Kind>('certificate');
  const [forma, setForma] = useState<{ path: string; w: number; h: number; url: string } | null>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [active, setActive] = useState<string>('full_name');
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const img = useRef<HTMLImageElement>(null);

  useEffect(() => {
    let alive = true;
    setForma(null);
    setLayout(null);
    setPreview(null);
    setActive('full_name');
    api
      .getTemplate(kind)
      .then(async (tpl) => {
        if (!alive || !tpl) return;
        setForma({ path: tpl.forma_path, w: tpl.width, h: tpl.height, url: await api.formaUrl(tpl.forma_path) });
        setLayout(tpl.layout as Layout);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [api, kind]);

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setStatus(null);
    try {
      const r = await api.uploadTemplateFile(kind, file);
      setForma({ path: r.forma_path, w: r.width, h: r.height, url: await api.formaUrl(r.forma_path) });
      setLayout((old) => old ?? defaultLayout(kind, r.width, r.height));
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function place(e: MouseEvent<HTMLImageElement>) {
    if (!forma || !layout || !img.current) return;
    const rect = img.current.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * forma.w);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * forma.h);
    setLayout({ fields: { ...layout.fields, [active]: { ...layout.fields[active], x, y } } });
  }

  function setNum(key: keyof FieldCfg, v: string) {
    if (!layout) return;
    const n = Number(v);
    setLayout({ fields: { ...layout.fields, [active]: { ...layout.fields[active], [key]: Number.isFinite(n) ? n : 0 } } });
  }

  async function doPreview() {
    if (!forma || !layout) return;
    setBusy(true);
    try {
      setPreview(await api.preview(kind, layout, forma.path, SAMPLE));
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!forma || !layout) return;
    setBusy(true);
    try {
      await api.saveTemplate(kind, forma.path, forma.w, forma.h, layout);
      setStatus('✓');
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const f = layout?.fields[active];
  return (
    <>
      <h1 className="admin-h1">{t('admin.templates')}</h1>
      <div className="filter-row">
        {(['certificate', 'card'] as Kind[]).map((k) => (
          <button key={k} type="button" className={`chip-btn ${kind === k ? 'is-active' : ''}`} onClick={() => setKind(k)}>
            {t(k === 'card' ? 'admin.card' : 'admin.certificate')}
          </button>
        ))}
      </div>
      <div className="admin-panel">
        <label className="file-btn">
          {t('admin.upload')}
          <input type="file" accept="image/png,image/jpeg,application/pdf" disabled={busy} onChange={(e) => void upload(e.target.files?.[0])} />
        </label>
        {status && <p className="admin-count">{status}</p>}
      </div>
      {forma && layout && f && (
        <div className="studio">
          <div className="studio-canvas">
            <img ref={img} src={forma.url} alt="" onClick={place} />
            {Object.entries(layout.fields).map(([key, cfg]) => (
              <span
                key={key}
                className={`studio-marker ${key === active ? 'is-active' : ''}`}
                style={{ left: `${(cfg.x / forma.w) * 100}%`, top: `${(cfg.y / forma.h) * 100}%`, width: `${(cfg.max_width / forma.w) * 100}%` }}
              >
                {key}
              </span>
            ))}
          </div>
          <div className="admin-panel studio-side">
            <div className="filter-row">
              {Object.keys(layout.fields).map((k) => (
                <button key={k} type="button" className={`chip-btn ${k === active ? 'is-active' : ''}`} onClick={() => setActive(k)}>
                  {k}
                </button>
              ))}
            </div>
            {(['x', 'y', 'size', 'min_size', 'max_width', 'max_lines'] as const).map((k) => (
              <label key={k}>
                {k}
                <input type="number" value={f[k]} onChange={(e) => setNum(k, e.target.value)} />
              </label>
            ))}
            <label>
              color
              <input
                type="color"
                value={f.color}
                onChange={(e) => setLayout({ fields: { ...layout.fields, [active]: { ...f, color: e.target.value } } })}
              />
            </label>
            <div className="row-actions">
              <button type="button" disabled={busy} onClick={() => void doPreview()}>
                {t('admin.preview')}
              </button>
              <button type="button" className="btn-primary" disabled={busy} onClick={() => void save()}>
                {t('admin.save')}
              </button>
            </div>
          </div>
          {preview && <img className="studio-preview" src={preview} alt={t('admin.preview')} />}
        </div>
      )}
    </>
  );
}

/* ---------- Export ---------- */
export function ExportPage() {
  const { t } = useI18n();
  const api = useAdminApi();
  const [lang, setLang] = useState<'ar' | 'en'>('ar');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    setError(null);
    try {
      downloadExport(await api.exportAll(), lang);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1 className="admin-h1">{t('admin.export')}</h1>
      <div className="admin-panel" style={{ maxWidth: 420 }}>
        <label>
          {t('admin.exportLang')}
          <select value={lang} onChange={(e) => setLang(e.target.value as 'ar' | 'en')}>
            <option value="ar">العربية</option>
            <option value="en">English</option>
          </select>
        </label>
        <button type="button" className="btn-primary" disabled={busy} onClick={() => void go()}>
          {t('admin.download')}
        </button>
        {error && <p className="admin-error">{error}</p>}
      </div>
    </>
  );
}

/* ---------- Staff (owner) ---------- */
export function StaffPage() {
  const { t } = useI18n();
  const api = useAdminApi();
  const { session } = useAuth();
  const [list, setList] = useState<StaffMember[]>([]);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'doctor' | 'admin'>('doctor');
  const [msg, setMsg] = useState<string | null>(null);
  const load = () => api.listStaff().then(setList).catch((e: Error) => setMsg(e.message));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => void load(), [api]);

  const [gEmail, setGEmail] = useState('');
  const [gName, setGName] = useState('');
  const [gRole, setGRole] = useState<'doctor' | 'admin'>('doctor');
  const [gMsg, setGMsg] = useState<string | null>(null);

  async function grant(e: FormEvent) {
    e.preventDefault();
    setGMsg(null);
    try {
      const r = await api.grantStaff(gEmail.trim(), gRole, gName.trim());
      if (r.status === 'no_account') {
        setGMsg(t('admin.noAccount'));
        return;
      }
      setGEmail('');
      setGName('');
      setGMsg(t('admin.granted'));
      await load();
    } catch (err) {
      setGMsg((err as Error).message);
    }
  }

  async function invite() {
    setMsg(null);
    try {
      await api.inviteStaff(email.trim(), role, name.trim());
      setEmail('');
      setName('');
      setMsg('✓');
      await load();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  return (
    <>
      <h1 className="admin-h1">{t('admin.staff')}</h1>
      <form className="admin-panel" style={{ maxWidth: 520 }} aria-label={t('admin.grantTitle')} onSubmit={(e) => void grant(e)}>
        <h2 className="admin-h2">{t('admin.grantTitle')}</h2>
        <p className="admin-count">{t('admin.grantHint')}</p>
        <label>
          {t('staff.email')}
          <input type="email" name="email" dir="ltr" required value={gEmail} onChange={(e) => setGEmail(e.target.value)} />
        </label>
        <label>
          {t('reg.fullName')}
          <input name="display_name" value={gName} onChange={(e) => setGName(e.target.value)} />
        </label>
        <label>
          {t('admin.role')}
          <select value={gRole} onChange={(e) => setGRole(e.target.value as 'doctor' | 'admin')}>
            <option value="doctor">{t('admin.doctor')}</option>
            <option value="admin">{t('admin.adminRole')}</option>
          </select>
        </label>
        <button type="submit" className="btn-primary" disabled={!gEmail.includes('@')}>
          {t('admin.grant')}
        </button>
        {gMsg && <p className="admin-count" role="status">{gMsg}</p>}
      </form>
      <div className="admin-panel" style={{ maxWidth: 520 }}>
        <h2 className="admin-h2">{t('admin.invite')}</h2>
        <label>
          {t('staff.email')}
          <input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          {t('reg.fullName')}
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          {t('admin.role')}
          <select value={role} onChange={(e) => setRole(e.target.value as 'doctor' | 'admin')}>
            <option value="doctor">doctor</option>
            <option value="admin">admin</option>
          </select>
        </label>
        <button type="button" className="btn-primary" disabled={!email.includes('@')} onClick={() => void invite()}>
          {t('admin.invite')}
        </button>
        {msg && <p className="admin-count">{msg}</p>}
      </div>
      <div className="table-wrap">
        <table className="admin-table">
          <tbody>
            {list.map((s) => (
              <tr key={s.user_id}>
                <td>
                  <strong>{s.display_name}</strong>
                  <div className="cell-sub" dir="ltr">
                    {s.email}
                  </div>
                </td>
                <td>{s.role}</td>
                <td>
                  {s.user_id !== session?.user.id && s.role !== 'owner' && (
                    <label className="row-actions">
                      <input
                        type="checkbox"
                        checked={s.active}
                        onChange={async (e) => {
                          await api.setStaff(s.user_id, s.role, e.target.checked);
                          await load();
                        }}
                      />
                      {t('admin.active')}
                    </label>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ---------- Audit (owner) ---------- */
export function AuditPage() {
  const { t, lang } = useI18n();
  const api = useAdminApi();
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<Page<AuditEntry> | null>(null);
  useEffect(() => {
    api.audit(50, offset).then(setPage).catch(() => setPage({ rows: [], total: 0 }));
  }, [api, offset]);
  return (
    <>
      <h1 className="admin-h1">{t('admin.audit')}</h1>
      <div className="table-wrap">
        <table className="admin-table">
          <tbody>
            {page?.rows.map((a) => (
              <tr key={a.id}>
                <td className="num">{new Date(a.at).toLocaleString(lang === 'ar' ? 'ar-IQ' : 'en-GB')}</td>
                <td dir="ltr">{a.actor_email}</td>
                <td>{a.action}</td>
                <td className="cell-sub">{a.target}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {page && page.total > 50 && (
        <div className="pager">
          <button type="button" disabled={offset === 0} onClick={() => setOffset(offset - 50)}>
            ‹
          </button>
          <button type="button" disabled={offset + 50 >= page.total} onClick={() => setOffset(offset + 50)}>
            ›
          </button>
        </div>
      )}
    </>
  );
}
