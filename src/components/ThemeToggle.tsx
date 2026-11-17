import { useState } from 'react';
import { useI18n } from '../i18n';
import { initialSiteTheme, saveSiteTheme, type SiteTheme } from '../lib/siteTheme';

/** Sun/moon button next to the language button: switches the page at once, remembered on this device. */
export function ThemeToggle() {
  const { t } = useI18n();
  const [theme, setTheme] = useState<SiteTheme>(() =>
    document.documentElement.dataset.theme === 'night' ? 'night' : initialSiteTheme(),
  );
  const night = theme === 'night';
  const label = night ? t('theme.day') : t('theme.night');
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={label}
      title={label}
      onClick={() => {
        const next: SiteTheme = night ? 'day' : 'night';
        saveSiteTheme(next);
        setTheme(next);
      }}
    >
      {night ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" />
        </svg>
      )}
    </button>
  );
}
