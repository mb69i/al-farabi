import type { SupabaseClient } from '@supabase/supabase-js';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthState } from '../auth/AuthProvider';
import { I18nProvider } from '../i18n';
import { MfaSetup } from './MfaSetup';

function client() {
  const mfa = {
    listFactors: vi.fn(async () => ({ data: { totp: [], all: [] } })),
    unenroll: vi.fn(async () => ({})),
    enroll: vi.fn(async () => ({ data: { id: 'f1', totp: { qr_code: 'data:image/svg+xml;utf8,<svg/>', secret: 'JBSWY3DPEHPK3PXP' } } })),
    challengeAndVerify: vi.fn(async () => ({ error: null })),
  };
  return { auth: { mfa } } as unknown as SupabaseClient & { auth: { mfa: typeof mfa } };
}

function view(c: SupabaseClient, session: AuthState['session']) {
  const auth = { session, role: 'owner', aal: 'aal1', refresh: vi.fn() } as unknown as AuthState;
  return (
    <I18nProvider initial="en">
      <AuthContext.Provider value={auth}>
        <MemoryRouter>
          <MfaSetup client={c} />
        </MemoryRouter>
      </AuthContext.Provider>
    </I18nProvider>
  );
}

describe('MfaSetup', () => {
  it('enrols once even when the session object is refreshed (tab switch)', async () => {
    const c = client();
    const { rerender } = render(view(c, { user: { id: 'u1' } } as AuthState['session']));
    await waitFor(() => expect(c.auth.mfa.enroll).toHaveBeenCalledTimes(1));
    rerender(view(c, { user: { id: 'u1' } } as AuthState['session']));
    rerender(view(c, { user: { id: 'u1' } } as AuthState['session']));
    await new Promise((r) => setTimeout(r, 20));
    expect(c.auth.mfa.enroll).toHaveBeenCalledTimes(1);
    expect(c.auth.mfa.unenroll).not.toHaveBeenCalled();
  });

  it('a signed-up admin can verify a code in StrictMode (dev runs effects twice)', async () => {
    const c = client();
    c.auth.mfa.listFactors.mockResolvedValue({ data: { totp: [{ id: 'f9', status: 'verified' }], all: [] } } as never);
    render(<StrictMode>{view(c, { user: { id: 'u1' } } as AuthState['session'])}</StrictMode>);
    await new Promise((r) => setTimeout(r, 20));
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    await waitFor(() => expect(c.auth.mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: 'f9', code: '123456' }));
  });

  it('shows the secret for typing into the app by hand', async () => {
    render(view(client(), { user: { id: 'u1' } } as AuthState['session']));
    expect(await screen.findByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument();
  });
});
