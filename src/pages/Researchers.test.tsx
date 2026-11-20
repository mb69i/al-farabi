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
  { id: 'r1', name_ar: 'أحمد علي', name_en: 'Ahmed Ali', institution: 'جامعة بغداد', research_title: 'بحث أول', signed: false },
  { id: 'r2', name_ar: 'أحمد حسن', name_en: null, institution: 'جامعة البصرة', research_title: 'بحث ثان', signed: true },
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
  fireEvent.change(screen.getByLabelText('Search by researcher name'), { target: { value: q } });
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

  it('confirming submits once and shows success', async () => {
    const { submit } = setup();
    await typeSearch('احمد');
    fireEvent.click((await screen.findByText('أحمد علي')).closest('button')!);
    fireEvent.click(screen.getByText('draw stroke'));
    fireEvent.click(screen.getByText('draw stroke'));
    const confirm = screen.getByRole('button', { name: 'Confirm signature' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    // 20 Nov: only a sign-in email; no card, no email certificate (the paper certificate comes later)
    expect(await screen.findByText(/email confirming they are signed in; the printed certificate comes after the conference/i)).toBeInTheDocument();
    expect(screen.queryByText(/card/i)).toBeNull();
    expect(submit).toHaveBeenCalledTimes(1);
    expect((submit.mock.calls[0] as unknown[])[0]).toMatchObject({ id: 'r1' });
  });

  it('a failed save keeps the pad and shows the error', async () => {
    setup(vi.fn(async () => {
      throw new Error('offline');
    }));
    await typeSearch('احمد');
    fireEvent.click((await screen.findByText('أحمد علي')).closest('button')!);
    fireEvent.click(screen.getByText('draw stroke'));
    fireEvent.click(screen.getByText('draw stroke'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm signature' }));
    expect(await screen.findByText(/could not be saved/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm signature' })).toBeEnabled();
  });
});
