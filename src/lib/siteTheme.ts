export type SiteTheme = 'day' | 'night';
export const SITE_THEME_KEY = 'site-theme';

/** The visitor's own choice on this device; day until they press the button. */
export function initialSiteTheme(): SiteTheme {
  try {
    return localStorage.getItem(SITE_THEME_KEY) === 'night' ? 'night' : 'day';
  } catch {
    return 'day';
  }
}

export function applySiteTheme(theme: SiteTheme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'night' ? '#0C1733' : '#FFFFFF');
}

export function saveSiteTheme(theme: SiteTheme) {
  applySiteTheme(theme);
  try {
    localStorage.setItem(SITE_THEME_KEY, theme);
  } catch {
    /* private window: still switches for this visit */
  }
}
