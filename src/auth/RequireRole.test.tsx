import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n';
import { AuthContext, type AuthState } from './AuthProvider';
import { RequireRole } from './RequireRole';

function state(over: Partial<AuthState>): AuthState {
  return {
    loading: false,
    session: { user: { id: 'u' } } as AuthState['session'],
    role: null,
    aal: 'aal1',
    email: 'x@y.z',
    signIn: vi.fn(),
    signOut: vi.fn(),
    refresh: vi.fn(),
    ...over,
  };
}

function at(auth: AuthState, roles: Array<'owner' | 'admin' | 'doctor'>) {
  render(
    <I18nProvider initial="en">
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={['/protected']}>
          <Routes>
            <Route path="/protected" element={<RequireRole roles={roles}><p>secret page</p></RequireRole>} />
            <Route path="/staff/login" element={<p>login page</p>} />
            <Route path="/staff/mfa" element={<p>mfa page</p>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </I18nProvider>,
  );
}

describe('RequireRole', () => {
  it('sends a signed-out visitor to login', () => {
    at(state({ session: null }), ['admin']);
    expect(screen.getByText('login page')).toBeInTheDocument();
  });

  it('RequireRole sends aal1 admin to mfa', () => {
    at(state({ role: 'admin', aal: 'aal1' }), ['admin', 'owner']);
    expect(screen.getByText('mfa page')).toBeInTheDocument();
  });

  it('lets an aal2 admin in', () => {
    at(state({ role: 'admin', aal: 'aal2' }), ['admin', 'owner']);
    expect(screen.getByText('secret page')).toBeInTheDocument();
  });

  it('RequireRole blocks doctor from admin', () => {
    at(state({ role: 'doctor' }), ['admin', 'owner']);
    expect(screen.getByText('You do not have access to this page')).toBeInTheDocument();
    expect(screen.queryByText('secret page')).toBeNull();
  });

  it('lets a doctor into a doctor page without the authenticator step', () => {
    at(state({ role: 'doctor', aal: 'aal1' }), ['doctor', 'admin', 'owner']);
    expect(screen.getByText('secret page')).toBeInTheDocument();
  });

  it('an admin on a doctor page still needs aal2', () => {
    at(state({ role: 'admin', aal: 'aal1' }), ['doctor', 'admin', 'owner']);
    expect(screen.getByText('mfa page')).toBeInTheDocument();
  });

  it('shows nothing sensitive while loading', () => {
    at(state({ loading: true }), ['admin']);
    expect(screen.queryByText('secret page')).toBeNull();
  });
});
