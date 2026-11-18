import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ar } from './ar';
import { en } from './en';
import { detectLang, I18nProvider, useI18n } from './index';

describe('detectLang', () => {
  it('uses Arabic when the phone language is Arabic', () => {
    expect(detectLang(['ar-IQ', 'en'])).toBe('ar');
  });
  it('uses English when the phone language is English, even if Arabic is second', () => {
    expect(detectLang(['en-US', 'ar'])).toBe('en');
  });
  it('defaults to Arabic when nothing is known', () => {
    expect(detectLang([])).toBe('ar');
  });
  it('uses English for any other first language', () => {
    expect(detectLang(['fa-IR'])).toBe('en');
  });
});

describe('dictionaries', () => {
  it('have exactly the same keys', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ar).sort());
  });
  it('registration promises the certificate that is emailed right away, not a card', () => {
    const keys = ['reg.lead', 'reg.fullNameHint', 'reg.emailHint', 'thanks.emailNote'] as const;
    for (const k of keys) {
      expect(ar[k]).toMatch(/شهادة|شهادتك/);
      expect(ar[k]).not.toMatch(/بطاقة|بطاقتك/);
      expect(en[k]).toMatch(/certificate/i);
      expect(en[k]).not.toMatch(/card/i);
    }
  });
  it('have no empty strings', () => {
    for (const v of [...Object.values(ar), ...Object.values(en)]) expect(v.trim()).not.toBe('');
  });
});

function Probe() {
  const { t, lang, setLang, dir } = useI18n();
  return (
    <div>
      <span data-testid="thanks">{t('admin.backupPairTitle', { name: 'Ali' })}</span>
      <span data-testid="dir">{dir}</span>
      <button onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}>toggle</button>
    </div>
  );
}

describe('I18nProvider', () => {
  it('t interpolates {name}', () => {
    render(
      <I18nProvider initial="en">
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByTestId('thanks').textContent).toContain('Ali');
    expect(screen.getByTestId('thanks').textContent).not.toContain('{name}');
  });

  it('setLang updates html dir and lang attributes', () => {
    render(
      <I18nProvider initial="ar">
        <Probe />
      </I18nProvider>,
    );
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');
    expect(document.documentElement.getAttribute('lang')).toBe('ar');
    act(() => screen.getByText('toggle').click());
    expect(document.documentElement.getAttribute('dir')).toBe('ltr');
    expect(document.documentElement.getAttribute('lang')).toBe('en');
    expect(screen.getByTestId('dir').textContent).toBe('ltr');
  });
});
