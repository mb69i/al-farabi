import { useEffect, useState, type FormEvent } from 'react';
import type { Contact } from '../components/SiteFooter';
import { useI18n } from '../i18n';

/** Admin form for the page footer's "Contact us" block (stored in the site settings). */
export function ContactForm({ load, save }: { load: () => Promise<Contact | null>; save: (c: Contact) => Promise<unknown> }) {
  const { t } = useI18n();
  const [form, setForm] = useState<Contact | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    load()
      .then((c) => setForm(c ?? { phone: '', email: '', location_ar: '', location_en: '' }))
      .catch((e: Error) => setMsg(e.message));
  }, [load]);

  if (!form) return null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await save(form!);
      setMsg(t('admin.saved'));
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const field = (key: keyof Contact, label: string, ltr = false) => (
    <label>
      {label}
      <input
        value={form[key]}
        dir={ltr ? 'ltr' : undefined}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </label>
  );

  return (
    <form className="admin-panel" style={{ maxWidth: 620 }} onSubmit={(e) => void submit(e)}>
      <h2 className="admin-h2">{t('admin.contact')}</h2>
      {field('phone', t('footer.phone'), true)}
      {field('email', t('footer.email'), true)}
      {field('location_ar', t('admin.locationAr'))}
      {field('location_en', t('admin.locationEn'), true)}
      <button type="submit" className="btn-primary" disabled={busy}>
        {t('admin.save')}
      </button>
      {msg && (
        <p className="admin-count" role="status">
          {msg}
        </p>
      )}
    </form>
  );
}
