import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n';
import { ContactProvider, CREDITS, SiteFooter, type Contact } from './SiteFooter';

function setup(contact: Contact | null, lang: 'ar' | 'en' = 'en') {
  const load = vi.fn(async () => contact);
  render(
    <I18nProvider initial={lang}>
      <ContactProvider load={load}>
        <SiteFooter />
      </ContactProvider>
    </I18nProvider>,
  );
  return load;
}

describe('SiteFooter', () => {
  it('shows the contact details from the settings and the credits', async () => {
    setup({ phone: '07701112222', email: 'info@alfarabiuc.edu.iq', location_ar: 'جامعة الفارابي — بغداد', location_en: 'Al-Farabi University — Baghdad' });
    expect(await screen.findByText('Contact us')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '07701112222' })).toHaveAttribute('href', 'tel:07701112222');
    expect(screen.getByRole('link', { name: 'info@alfarabiuc.edu.iq' })).toHaveAttribute('href', 'mailto:info@alfarabiuc.edu.iq');
    expect(screen.getByText('Al-Farabi University — Baghdad')).toBeInTheDocument();
    expect(screen.getByText(CREDITS)).toBeInTheDocument();
  });

  it('uses the Arabic location in Arabic', async () => {
    setup({ phone: '', email: '', location_ar: 'جامعة الفارابي — بغداد', location_en: 'Al-Farabi University — Baghdad' }, 'ar');
    expect(await screen.findByText('جامعة الفارابي — بغداد')).toBeInTheDocument();
  });

  it('hides empty fields instead of showing placeholders', async () => {
    setup({ phone: '', email: '', location_ar: 'بغداد', location_en: 'Baghdad' });
    await screen.findByText('Baghdad');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('still shows the credits when the settings cannot be loaded', async () => {
    setup(null);
    expect(await screen.findByText(CREDITS)).toBeInTheDocument();
  });

  it('credits are exactly as requested', () => {
    expect(CREDITS).toBe('Developed by Mohammed AL-Baqir, supervised by Asst. Lec. Cenna Ghani and Asst. Lec. Omar Ali');
  });
});
