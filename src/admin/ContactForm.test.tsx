import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n';
import { ContactForm } from './ContactForm';

const CURRENT = { phone: '', email: '', location_ar: 'جامعة الفارابي — بغداد', location_en: 'Al-Farabi University — Baghdad' };

function setup(save = vi.fn(async (c: typeof CURRENT) => c)) {
  render(
    <I18nProvider initial="en">
      <ContactForm load={async () => CURRENT} save={save} />
    </I18nProvider>,
  );
  return save;
}

describe('ContactForm', () => {
  it('loads the current details and saves the edited ones', async () => {
    const save = setup();
    const phone = await screen.findByLabelText('Phone');
    expect((screen.getByLabelText('Location (Arabic)') as HTMLInputElement).value).toBe('جامعة الفارابي — بغداد');
    fireEvent.change(phone, { target: { value: '07701112222' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'info@alfarabiuc.edu.iq' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({ ...CURRENT, phone: '07701112222', email: 'info@alfarabiuc.edu.iq' }),
    );
    expect(await screen.findByText('Saved')).toBeInTheDocument();
  });

  it('shows the error when saving is refused', async () => {
    setup(vi.fn(async () => {
      throw new Error('invalid email');
    }));
    await screen.findByLabelText('Phone');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('invalid email')).toBeInTheDocument();
  });
});
