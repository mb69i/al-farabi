import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '../i18n';
import { applySiteTheme, initialSiteTheme } from '../lib/siteTheme';
import { ThemeToggle } from './ThemeToggle';

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe('site day/night button', () => {
  it('starts in day mode when the visitor has not chosen', () => {
    expect(initialSiteTheme()).toBe('day');
  });

  it('switches the whole page at once and remembers the choice on this device', () => {
    applySiteTheme(initialSiteTheme());
    render(
      <I18nProvider initial="en">
        <ThemeToggle />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Night mode' }));
    expect(document.documentElement.dataset.theme).toBe('night');
    expect(localStorage.getItem('site-theme')).toBe('night');
    expect(initialSiteTheme()).toBe('night');
    fireEvent.click(screen.getByRole('button', { name: 'Day mode' }));
    expect(document.documentElement.dataset.theme).toBe('day');
  });
});
