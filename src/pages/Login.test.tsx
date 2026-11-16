import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthState } from '../auth/AuthProvider';
import { I18nProvider } from '../i18n';
import { Login } from './Login';

function setup(over: Partial<AuthState>) {
  const auth: AuthState = {
    loading: false, session: null, role: null, aal: 'aal1', email: null,
    signIn: vi.fn(async () => ({ ok: false })), signOut: vi.fn(), refresh: vi.fn(), ...over,
  };
  render(
    <I18nProvider initial="en">
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={['/staff/login']}>
          <Routes>
            <Route path="/staff/login" element={<Login />} />
            <Route path="/researchers" element={<p>researchers page</p>} />
            <Route path="/staff/mfa" element={<p>mfa page</p>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </I18nProvider>,
  );
  if (auth.session) return auth;
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'dr@x.org' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'long-password-1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  return auth;
}

describe('Login', () => {
  it('shows the bad-login message', async () => {
    setup({});
    expect(await screen.findByText('Wrong email or password')).toBeInTheDocument();
  });

  it('a signed-in doctor goes to the researchers page', async () => {
    setup({ session: { user: { id: 'u' } } as AuthState['session'], role: 'doctor' });
    expect(await screen.findByText('researchers page')).toBeInTheDocument();
  });

  it('a signed-in admin at aal1 goes to the authenticator step', async () => {
    setup({ session: { user: { id: 'u' } } as AuthState['session'], role: 'admin', aal: 'aal1' });
    expect(await screen.findByText('mfa page')).toBeInTheDocument();
  });
});
