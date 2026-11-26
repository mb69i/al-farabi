import type { ReactNode } from 'react';
import { useI18n } from '../i18n';
import { SiteFooter } from './SiteFooter';
import { ThemeToggle } from './ThemeToggle';

/** ministry: kept so callers compile; the TEDx pages never show the Ministry's logo (owner, 26 Nov). */
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

export function Shell({ children, variant = 'public', actions }: Props) {
  const { t } = useI18n();
  return (
    <div className={`shell shell--${variant}`}>
      <header className="shell-header">
        {/* TEDxBaghdad 2026 training at Al-Farabi (owner, 26 Nov): public pages sit on the violet poster band, so the
            white logo; staff pages are white, so the original logo on a white plate. Then the host university's crest. */}
        <div className="shell-logos" dir="ltr">
          {variant === 'public' ? (
            <img className="tedx-logo tedx-logo--white" src="/brand/tedx-baghdad-white-720.png" alt="TEDxBaghdad" width={150} height={28} />
          ) : (
            <span className="tedx-plate">
              <img className="tedx-logo" src="/brand/tedx-baghdad-720.png" alt="TEDxBaghdad" width={150} height={28} />
            </span>
          )}
          <span className="divider" aria-hidden="true" />
          <span className="crest-badge">
            <img className="crest" src="/brand/crest-192.png" alt={t('brand.university')} width={42} height={44} />
          </span>
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
