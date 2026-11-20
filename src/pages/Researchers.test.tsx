import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n';
import type { ResearcherRow } from '../lib/staffApi';
import { Researchers } from './Researchers';

const pad = vi.hoisted(() => ({ n: 0 }));

vi.mock('../components/SignaturePad', () => ({
  SignaturePad: ({ onChange }: { onChange: (n: number, png: () => Promise<Blob>, strokes: () => unknown) => void }) => {
    return (
      <button
        type="button"
        onClick={() => {
          pad.n += 1;
          onChange(pad.n, async () => new Blob(['png']), () => [[pad.n]]);
        }}
      >
        draw stroke
      </button>
    );
  },
}));

const ROWS: ResearcherRow[] = [
  { id: 'r1', name_ar: 'أحمد علي', name_en: 'Ahmed Ali', institution: 'جامعة بغداد', research_title: 'بحث أول', signed: false, paper_code: 'ARCDT26-007', hall: 'L_102' },
  { id: 'r2', name_ar: 'أحمد حسن', name_en: null, institution: 'جامعة البصرة', research_title: 'بحث ثان', signed: true, paper_code: null, hall: null },
];

function setup(submit = vi.fn(async () => ({ status: 'signed' as const }))) {
  const search = vi.fn(async () => ROWS);
  render(
    <I18nProvider initial="en">
      <Researchers search={search} submit={submit} />
    </I18nProvider>,
  );
  return { search, submit };
}

async function typeSearch(q: string) {
  fireEvent.change(screen.getByLabelText('Search researchers'), { target: { value: q } });
  await act(async () => {
    vi.advanceTimersByTime(300);
  });
}

beforeEach(() => {
  pad.n = 0;
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => vi.useRealTimers());

describe('Researchers', () => {
  it('searches after 2 characters with a debounce', async () => {
    const { search } = setup();
    await typeSearch('a');
    expect(search).not.toHaveBeenCalled();
    await typeSearch('احمد');
    expect(search).toHaveBeenCalledWith('احمد');
    expect(await screen.findByText('أحمد علي')).toBeInTheDocument();
  });

  it('already signed row cannot open pad', async () => {
    setup();
    await typeSearch('احمد');
    const signedRow = (await screen.findByText('أحمد حسن')).closest('button')!;
    expect(signedRow).toBeDisabled();
    expect(signedRow.textContent).toContain('Signed');
  });

  it('confirm disabled until the first stroke', async () => {
    setup();
    await typeSearch('احمد');
    fireEvent.click((await screen.findByText('أحمد علي')).closest('button')!);
    const confirm = screen.getByRole('button', { name: 'Confirm signature' });
    expect(confirm).toBeDisabled();
    fireEvent.click(screen.getByText('draw stroke'));
    expect(confirm).toBeEnabled();
  });

  // Owner, 21 Nov: search by name, phone number, paper ID or email.
  it('says what can be searched and shows each paper ID and hall', async () => {
    setup();
    expect(screen.getByLabelText('Search researchers')).toHaveAttribute('placeholder', expect.stringMatching(/name.*phone.*paper ID.*email/i));
    await typeSearch('ARCDT26-007');
    const row = (await screen.findByText('أحمد علي')).closest('button')!;
    expect(row.textContent).toContain('ARCDT26-007');
    expect(row.textContent).toContain('L_102');
  });

  async function signFirst() {
    await typeSearch('احمد');
    fireEvent.click((await screen.findByText('أحمد علي')).closest('button')!);
    fireEvent.click(screen.getByText('draw stroke'));
    fireEvent.click(screen.getByText('draw stroke'));
  }

  // Owner, 21 Nov: "make the researchers sign in faster". The desk goes straight back to the search while
  // the signature saves in the background.
  it('goes straight back to the search while the signature saves', async () => {
    let finish!: (v: { status: 'signed' }) => void;
    const { submit } = setup(vi.fn(() => new Promise<{ status: 'signed' }>((r) => (finish = r))));
    await signFirst();
    const confirm = screen.getByRole('button', { name: 'Confirm signature' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(await screen.findByLabelText('Search researchers')).toHaveValue('');
    expect(screen.getByRole('status').textContent).toMatch(/Ahmed Ali.*Saving/);
    await act(async () => finish({ status: 'signed' }));
    // 20 Nov: only a sign-in email; no card, no email certificate (the paper certificate comes later)
    expect(screen.getByRole('status').textContent).toMatch(/email confirming they are signed in; the printed certificate comes after the conference/i);
    expect(screen.queryByText(/card/i)).toBeNull();
    expect(submit).toHaveBeenCalledTimes(1);
    expect((submit.mock.calls[0] as unknown[])[0]).toMatchObject({ id: 'r1' });
  });

  it('a researcher being saved cannot be opened twice', async () => {
    setup(vi.fn(() => new Promise<never>(() => {})));
    await signFirst();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm signature' }));
    await screen.findByLabelText('Search researchers');
    await typeSearch('احمد');
    expect((await screen.findByText('أحمد علي')).closest('button')).toBeDisabled();
  });

  it('a failed save is shown with a retry that sends the same signature again', async () => {
    const submit = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ status: 'signed' });
    setup(submit);
    await signFirst();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm signature' }));
    expect(await screen.findByText(/could not be saved/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(/email confirming they are signed in/i)).toBeInTheDocument();
    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit.mock.calls[1][1]).toBe(submit.mock.calls[0][1]); // same signature image
  });
});
