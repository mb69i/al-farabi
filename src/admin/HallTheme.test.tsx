import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n';
import { HallTheme } from './HallTheme';

describe('Admin hall screen day/night control', () => {
  it('shows the current choice and saves a new one', async () => {
    const save = vi.fn(async (t: string) => t);
    render(
      <I18nProvider initial="en">
        <HallTheme value="auto" onSave={save} />
      </I18nProvider>,
    );
    expect(screen.getByRole('radio', { name: 'Automatic (night after 6 pm)' })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: 'Night' }));
    expect(save).toHaveBeenCalledWith('night');
    expect(await screen.findByRole('radio', { name: 'Night' })).toBeChecked();
  });
});
