import type { ReactNode } from 'react';
import { useI18n } from '../i18n';
import { SiteFooter } from './SiteFooter';
import { ThemeToggle } from './ThemeToggle';

type Props = { children: ReactNode; variant?: 'public' | 'staff'; actions?: ReactNode };

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

export function Shell({ children, variant = 'public', actions }: Props) {
  const { t } = useI18n();
  return (
    <div className={`shell shell--${variant}`}>
      <header className="shell-header">
        <div className="shell-logos">
          <span className="crest-badge">
            <img className="crest" src="/brand/crest-192.png" alt={t('brand.university')} width={42} height={44} />
          </span>
          <span className="divider" aria-hidden="true" />
          {/* the official event logo on every page (owner, 20 Nov); night mode shows the version for dark backgrounds */}
          <img className="event-logo event-logo--light" src="/brand/conference-logo-light.svg" alt={t('brand.conference')} width={85} height={68} />
          <img className="event-logo event-logo--dark" src="/brand/conference-logo-dark.svg" alt="" aria-hidden="true" width={85} height={68} />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
