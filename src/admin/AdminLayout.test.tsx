import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AuthContext, type AuthState } from '../auth/AuthProvider';
import { I18nProvider } from '../i18n';
import { AdminLayout } from './AdminLayout';

// Owner, 20 Nov: "a way so I can enter any page from the admin dashboard".
describe('admin dashboard menu', () => {
  it('links to every other page of the system, each opening in a new tab', () => {
    const auth = { session: { user: { id: 'u' } }, role: 'admin', email: 'a@x.org' } as unknown as AuthState;
    render(
      <I18nProvider initial="en">
        <AuthContext.Provider value={auth}>
          <MemoryRouter>
            <AdminLayout>x</AdminLayout>
          </MemoryRouter>
        </AuthContext.Provider>
      </I18nProvider>,
    );
    const group = screen.getByRole('navigation', { name: 'Site pages' });
    const links = within(group).getAllByRole('link');
    expect(links.map((a) => [a.querySelector('span')?.textContent, a.getAttribute('href')])).toEqual([
      ['Registration page', '/'],
      ['Hall screen', '/display'],
      ['Researcher signing', '/researchers'],
      ['Certificate check', '/verify'],
    ]);
    for (const a of links) {
      expect(a).toHaveAttribute('target', '_blank');
      expect(a.getAttribute('rel')).toContain('noopener');
    }
  });
});
