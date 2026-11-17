import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthState } from '../auth/AuthProvider';
import { I18nProvider } from '../i18n';
import type { AdminApi } from './adminApi';
import { AdminApiProvider } from './AdminLayout';
import { StaffPage } from './pages2';

function setup(grantStaff: AdminApi['grantStaff']) {
  const api = { listStaff: vi.fn(async () => []), grantStaff, inviteStaff: vi.fn() } as unknown as AdminApi;
  const auth = { session: { user: { id: 'owner' } }, role: 'owner' } as unknown as AuthState;
  render(
    <I18nProvider initial="en">
      <AuthContext.Provider value={auth}>
        <AdminApiProvider value={api}>
          <StaffPage />
        </AdminApiProvider>
      </AuthContext.Provider>
    </I18nProvider>,
  );
  const form = screen.getByRole('form', { name: 'Give a role to an existing account' });
  fireEvent.change(form.querySelector('input[type="email"]')!, { target: { value: 'dr@x.org' } });
  fireEvent.change(form.querySelector('input[name="display_name"]')!, { target: { value: 'Dr Ali' } });
  fireEvent.click(screen.getByRole('button', { name: 'Give role' }));
  return api;
}

describe('StaffPage grant', () => {
  it('grants the doctor role to an existing account', async () => {
    const grant = vi.fn(async () => ({ status: 'ok' as const }));
    const api = setup(grant);
    await waitFor(() => expect(grant).toHaveBeenCalledWith('dr@x.org', 'doctor', 'Dr Ali'));
    expect(await screen.findByText('Role granted')).toBeInTheDocument();
    expect(api.listStaff).toHaveBeenCalledTimes(2);
  });

  it('explains when no account exists for that email', async () => {
    setup(vi.fn(async () => ({ status: 'no_account' as const })));
    expect(await screen.findByText(/No account with this email/)).toBeInTheDocument();
  });
});
