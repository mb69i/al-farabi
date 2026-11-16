import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n';
import { Switches, type SwitchState } from './Switches';

const ON: SwitchState = { registration_open: true, cards_enabled: true, certificates_enabled: false };

function setup(onSave = vi.fn(async (s: SwitchState) => s)) {
  render(
    <I18nProvider initial="en">
      <Switches value={ON} onSave={onSave} />
    </I18nProvider>,
  );
  return onSave;
}

describe('Switches', () => {
  it('switch off asks for confirmation then calls admin_set_switches', async () => {
    const onSave = setup();
    fireEvent.click(screen.getByRole('switch', { name: 'Send attendee cards' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('This stops immediately. Continue?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith({ ...ON, cards_enabled: false });
  });

  it('cancelling the confirmation changes nothing', () => {
    const onSave = setup();
    fireEvent.click(screen.getByRole('switch', { name: 'Registration open' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('switch', { name: 'Registration open' })).toHaveAttribute('aria-checked', 'true');
  });

  it('switching on saves straight away', () => {
    const onSave = setup();
    fireEvent.click(screen.getByRole('switch', { name: 'Send certificates' }));
    expect(onSave).toHaveBeenCalledWith({ ...ON, certificates_enabled: true });
  });
});
