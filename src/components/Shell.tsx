import type { ReactNode } from 'react';
import { ConferenceMark } from '../brand/ConferenceMark';
import { useI18n } from '../i18n';

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
          <span className="divider" aria-hidden="true" />
          <ConferenceMark size={variant === 'staff' ? 40 : 52} title={t('brand.conference')} />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {actions}
          <LanguageToggle />
        </div>
      </header>
      <main className="shell-main">{children}</main>
      {variant === 'public' && (
        <footer className="shell-footer">
          <img src="/brand/ministry.png" alt="" aria-hidden="true" width={36} height={36} />
          <span>{t('brand.place')}</span>
        </footer>
      )}
    </div>
  );
}
