import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useI18n } from '../i18n';
import './SiteFooter.css';

export type Contact = { phone: string; email: string; location_ar: string; location_en: string };

export const CREDITS =
  'Developed by Mohammed AL-Baqir, supervised by Asst. Lec. Cenna Ghani and Asst. Lec. Omar Ali';

const ContactContext = createContext<Contact | null>(null);

/** Loads the editable contact block once for the whole app (from the site settings). */
export function ContactProvider({ load, children }: { load: () => Promise<Contact | null>; children: ReactNode }) {
  const [contact, setContact] = useState<Contact | null>(null);
  useEffect(() => {
    let alive = true;
    load()
      .then((c) => alive && setContact(c))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [load]);
  return <ContactContext.Provider value={contact}>{children}</ContactContext.Provider>;
}

export function SiteFooter() {
  const { t, lang } = useI18n();
  const c = useContext(ContactContext);
  const location = c ? (lang === 'ar' ? c.location_ar : c.location_en) || c.location_ar : '';
  const hasContact = !!c && !!(c.phone || c.email || location);

  return (
    <footer className="site-footer">
      {hasContact && (
        <section className="site-footer-contact" aria-labelledby="footer-contact-title">
          <h2 id="footer-contact-title">{t('footer.contact')}</h2>
          <ul>
            {c!.phone && (
              <li>
                <span>{t('footer.phone')}</span>
                <a href={`tel:${c!.phone.replace(/[^\d+]/g, '')}`} dir="ltr">
                  {c!.phone}
                </a>
              </li>
            )}
            {c!.email && (
              <li>
                <span>{t('footer.email')}</span>
                <a href={`mailto:${c!.email}`} dir="ltr">
                  {c!.email}
                </a>
              </li>
            )}
            {location && (
              <li>
                <span>{t('footer.location')}</span>
                <span>{location}</span>
              </li>
            )}
          </ul>
        </section>
      )}
      <p className="site-footer-credits" lang="en" dir="ltr">
        {CREDITS}
      </p>
    </footer>
  );
}
