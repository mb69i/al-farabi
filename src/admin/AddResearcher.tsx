import { useState, type FormEvent } from 'react';
import { useI18n } from '../i18n';

/** One researcher typed in by hand on the admin dashboard (owner, 21 Nov). */
export type NewResearcher = {
  name_ar: string;
  email: string | null;
  phone: string | null;
  institution: string | null;
  research_title: string;
  paper_code: string | null;
  hall: string | null;
};

const L = {
  en: {
    title: 'Add a researcher by hand', name: 'Full name (Arabic)', research: 'Research title', paper: 'Paper ID',
    hall: 'Hall', phone: 'Phone', email: 'Email', institution: 'Institution', add: 'Add researcher', added: 'Added',
  },
  ar: {
    title: 'إضافة باحث يدويًا', name: 'الاسم الكامل (بالعربي)', research: 'عنوان البحث', paper: 'رقم البحث',
    hall: 'القاعة', phone: 'رقم الهاتف', email: 'البريد الإلكتروني', institution: 'الجهة', add: 'إضافة الباحث', added: 'تمت الإضافة',
  },
};

const FIELDS = ['name_ar', 'research_title', 'paper_code', 'hall', 'phone', 'email', 'institution'] as const;
type Field = (typeof FIELDS)[number];
const EMPTY: Record<Field, string> = { name_ar: '', research_title: '', paper_code: '', hall: '', phone: '', email: '', institution: '' };

export function AddResearcher({ add, onAdded }: { add: (r: NewResearcher) => Promise<unknown>; onAdded?: () => void }) {
  const { lang } = useI18n();
  const l = L[lang === 'en' ? 'en' : 'ar'];
  const label: Record<Field, string> = {
    name_ar: l.name, research_title: l.research, paper_code: l.paper, hall: l.hall, phone: l.phone, email: l.email, institution: l.institution,
  };
  const [v, setV] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const s = (k: Field) => v[k].trim() || null;
    setBusy(true);
    setMsg(null);
    try {
      await add({
        name_ar: v.name_ar.trim(), email: s('email'), phone: s('phone'), institution: s('institution'),
        research_title: v.research_title.trim(), paper_code: s('paper_code'), hall: s('hall'),
      });
      setV(EMPTY);
      setMsg({ ok: true, text: l.added });
      onAdded?.();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="add-researcher" onSubmit={(e) => void submit(e)}>
      <h2 className="admin-h2">{l.title}</h2>
      <div className="add-researcher-grid">
        {FIELDS.map((k) => (
          <label key={k} className="add-researcher-field">
            <span>{label[k]}</span>
            <input
              value={v[k]}
              required={k === 'name_ar' || k === 'research_title'}
              dir={['paper_code', 'hall', 'phone', 'email'].includes(k) ? 'ltr' : undefined}
              type={k === 'email' ? 'email' : k === 'phone' ? 'tel' : 'text'}
              onChange={(e) => setV({ ...v, [k]: e.target.value })}
            />
          </label>
        ))}
      </div>
      <button type="submit" className="btn-primary" disabled={busy}>{l.add}</button>
      {msg && <p className={msg.ok ? 'admin-ok' : 'admin-error'} role="status">{msg.text}</p>}
    </form>
  );
}
