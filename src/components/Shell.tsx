import type { ReactNode } from 'react';
import { useI18n } from '../i18n';
import { SiteFooter } from './SiteFooter';
import { ThemeToggle } from './ThemeToggle';

/** ministry: show the Ministry's logo too (owner, 20 Nov: registration and researcher pages); on by default for public pages. */
type Props = { children: ReactNode; variant?: 'public' | 'staff'; actions?: ReactNode; ministry?: boolean };

export function LanguageToggle() {
  const { t, lang, setLang } = useI18n();
  return (
    <button
      type="button"
      className="lang-toggle"
      aria-label={t('lang.switchLabel')}
      lang={lang === 'ar' ? 'en' : 'ar'}
      onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
    >
      {t('lang.switch')}
    </button>
  );
}

export function Shell({ children, variant = 'public', actions, ministry = variant === 'public' }: Props) {
  const { t } = useI18n();
  return (
    <div className={`shell shell--${variant}`}>
      <header className="shell-header">
        {/* same order as the certificate and the hall screen: crest | event logo | Ministry */}
        <div className="shell-logos" dir="ltr">
          <span className="crest-badge">
            <img className="crest" src="/brand/crest-192.png" alt={t('brand.university')} width={42} height={44} />
          </span>
          <span className="divider" aria-hidden="true" />
          {/* the official event logo on every page (owner, 20 Nov); night mode shows the version for dark backgrounds */}
          <img className="event-logo event-logo--light" src="/brand/conference-logo-light.svg" alt={t('brand.conference')} width={85} height={68} />
          <img className="event-logo event-logo--dark" src="/brand/conference-logo-dark.svg" alt="" aria-hidden="true" width={85} height={68} />
          {ministry && (
            <>
              <span className="divider" aria-hidden="true" />
              <img className="ministry" src="/brand/ministry-360.webp" alt={t('brand.ministry')} width={56} height={56} />
            </>
          )}
        </div>
        <div className="shell-actions">
          {actions}
          <ThemeToggle />
          <LanguageToggle />
        </div>
      </header>
      <main className="shell-main">{children}</main>
      <SiteFooter />
    </div>
  );
}
