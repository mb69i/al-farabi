import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n';
import type { AdminApi, BackupDevice } from './adminApi';
import { AdminApiProvider } from './AdminLayout';
import { BackupDevicesPage } from './BackupDevices';

const NOW = new Date('2026-11-21T09:00:00Z').getTime();
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();

const DEVICES: BackupDevice[] = [
  { id: 'd1', label: 'laptop-1', enabled: true, paired: true, pair_expires_at: null, last_seen_at: ago(2), created_at: ago(900) },
  { id: 'd2', label: 'Reception PC', enabled: true, paired: true, pair_expires_at: null, last_seen_at: ago(40), created_at: ago(500) },
  { id: 'd3', label: 'Dean laptop', enabled: false, paired: false, pair_expires_at: ago(-20), last_seen_at: null, created_at: ago(10) },
];

function setup(over: Partial<AdminApi> = {}) {
  const api = {
    listBackupDevices: vi.fn(async () => DEVICES),
    addBackupDevice: vi.fn(async (label: string) => ({ id: 'd9', label, code: 'ABCD-EFGH', expires_at: ago(-30) })),
    newBackupCode: vi.fn(async (id: string) => ({ id, label: 'Dean laptop', code: 'WXYZ-2345', expires_at: ago(-30) })),
    setBackupDevice: vi.fn(async () => undefined),
    deleteBackupDevice: vi.fn(async () => undefined),
    ...over,
  } as unknown as AdminApi;
  render(
    <I18nProvider initial="en">
      <AdminApiProvider value={api}>
        <BackupDevicesPage />
      </AdminApiProvider>
    </I18nProvider>,
  );
  return api;
}

const row = (name: string) => screen.getByText(name).closest('tr') as HTMLElement;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe('Backup devices (owner)', () => {
  it('lists every device with its on/off switch and when it last backed up', async () => {
    setup();
    await screen.findByText('laptop-1');
    expect(within(row('laptop-1')).getByText('2 min ago')).toBeInTheDocument();
    expect(within(row('laptop-1')).getByRole('switch', { name: 'Backups on for laptop-1' })).toHaveAttribute('aria-checked', 'true');
    expect(within(row('Dean laptop')).getByRole('switch', { name: 'Backups on for Dean laptop' })).toHaveAttribute('aria-checked', 'false');
    expect(within(row('Dean laptop')).getByText('Waiting for pairing')).toBeInTheDocument();
  });

  it('warns when a switched-on device has not backed up for more than 15 minutes', async () => {
    setup();
    await screen.findByText('Reception PC');
    expect(within(row('Reception PC')).getByText(/late/i)).toBeInTheDocument();
    expect(within(row('laptop-1')).queryByText(/late/i)).not.toBeInTheDocument();
  });

  it('switches a device off and on', async () => {
    const api = setup();
    await screen.findByText('laptop-1');
    fireEvent.click(within(row('laptop-1')).getByRole('switch'));
    await waitFor(() => expect(api.setBackupDevice).toHaveBeenCalledWith('d1', false));
    expect(api.listBackupDevices).toHaveBeenCalledTimes(2);
  });

  it('adds a device and shows the one-time code with the exact command to run on that PC', async () => {
    const api = setup();
    await screen.findByText('laptop-1');
    const form = screen.getByRole('form', { name: 'Add a backup device' });
    fireEvent.change(within(form).getByLabelText('Device name'), { target: { value: 'Library PC' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Add device' }));
    await waitFor(() => expect(api.addBackupDevice).toHaveBeenCalledWith('Library PC'));
    const pairing = await screen.findByRole('region', { name: 'Pair Library PC' });
    expect(within(pairing).getByText('ABCD-EFGH')).toBeInTheDocument();
    expect(within(pairing).getByText('python backup.py pair ABCD-EFGH')).toBeInTheDocument();
    expect(within(pairing).getByRole('link', { name: /backup\.py/ })).toHaveAttribute('href', '/backup/backup.py');
    // the folder path keeps its backslash
    expect(within(pairing).getByText((t) => t.includes('D:\\alfarabi-backups'))).toBeInTheDocument();
  });

  it('gives a waiting device a new code', async () => {
    const api = setup();
    await screen.findByText('Dean laptop');
    fireEvent.click(within(row('Dean laptop')).getByRole('button', { name: 'New code' }));
    await waitFor(() => expect(api.newBackupCode).toHaveBeenCalledWith('d3'));
    expect(await screen.findByText('python backup.py pair WXYZ-2345')).toBeInTheDocument();
  });

  it('deletes only after confirming', async () => {
    const api = setup();
    await screen.findByText('Reception PC');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    fireEvent.click(within(row('Reception PC')).getByRole('button', { name: 'Delete' }));
    expect(api.deleteBackupDevice).not.toHaveBeenCalled();
    fireEvent.click(within(row('Reception PC')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(api.deleteBackupDevice).toHaveBeenCalledWith('d2'));
    expect(confirm).toHaveBeenCalledTimes(2);
    confirm.mockRestore();
  });

  it('shows a refusal from the server (for example a duplicate name)', async () => {
    setup({ addBackupDevice: vi.fn(async () => { throw new Error('a device with this name already exists'); }) } as Partial<AdminApi>);
    await screen.findByText('laptop-1');
    const form = screen.getByRole('form', { name: 'Add a backup device' });
    fireEvent.change(within(form).getByLabelText('Device name'), { target: { value: 'laptop-1' } });
    await act(async () => {
      fireEvent.click(within(form).getByRole('button', { name: 'Add device' }));
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('a device with this name already exists');
  });
});
