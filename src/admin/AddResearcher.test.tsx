import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n';
import { AddResearcher, type NewResearcher } from './AddResearcher';

function setup(add = vi.fn(async (_r: NewResearcher) => {})) {
  const onAdded = vi.fn();
  render(
    <I18nProvider initial="en">
      <AddResearcher add={add} onAdded={onAdded} />
    </I18nProvider>,
  );
  return { add, onAdded };
}

describe('AddResearcher', () => {
  it('adds a researcher by hand with paper ID and hall, then clears the form', async () => {
    const { add, onAdded } = setup();
    fireEvent.change(screen.getByLabelText('Full name (Arabic)'), { target: { value: ' سنان صلاح ' } });
    fireEvent.change(screen.getByLabelText('Research title'), { target: { value: 'بحث جديد' } });
    fireEvent.change(screen.getByLabelText('Paper ID'), { target: { value: 'ARCDT26-300' } });
    fireEvent.change(screen.getByLabelText('Hall'), { target: { value: 'L_102' } });
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '07701234567' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add researcher' }));
    await waitFor(() =>
      expect(add).toHaveBeenCalledWith({
        name_ar: 'سنان صلاح', email: null, phone: '07701234567', institution: null,
        research_title: 'بحث جديد', paper_code: 'ARCDT26-300', hall: 'L_102',
      }),
    );
    expect(await screen.findByText('Added')).toBeInTheDocument();
    expect(onAdded).toHaveBeenCalled();
    expect((screen.getByLabelText('Full name (Arabic)') as HTMLInputElement).value).toBe('');
  });

  it('shows the error when the database refuses', async () => {
    setup(vi.fn(async () => { throw new Error('bad email'); }));
    fireEvent.change(screen.getByLabelText('Full name (Arabic)'), { target: { value: 'أ' } });
    fireEvent.change(screen.getByLabelText('Research title'), { target: { value: 'ب' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add researcher' }));
    expect(await screen.findByText('bad email')).toBeInTheDocument();
  });
});
