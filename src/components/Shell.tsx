import type { ReactNode } from 'react';
import { useI18n } from '../i18n';
import { SiteFooter } from './SiteFooter';

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
            <img className="crest" src="/brand/crest.png" alt={t('brand.university')} width={42} height={44} />
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {actions}
          <LanguageToggle />
        </div>
      </header>
      <main className="shell-main">{children}</main>
      <SiteFooter />
    </div>
  );
}
