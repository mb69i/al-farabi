import { createContext, useContext, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useI18n, type Key } from '../i18n';
import type { AdminApi } from './adminApi';
import './admin.css';

const AdminApiContext = createContext<AdminApi | null>(null);
export const AdminApiProvider = AdminApiContext.Provider;
export function useAdminApi(): AdminApi {
  const api = useContext(AdminApiContext);
  if (!api) throw new Error('useAdminApi outside provider');
  return api;
}

const LINKS: Array<{ to: string; label: Key; ownerOnly?: boolean }> = [
  { to: '/admin', label: 'admin.overview' },
  { to: '/admin/guests', label: 'admin.guests' },
  { to: '/admin/researchers', label: 'admin.researchers' },
  { to: '/admin/deliveries', label: 'admin.deliveries' },
  { to: '/admin/switches', label: 'admin.switches' },
  { to: '/admin/templates', label: 'admin.templates' },
  { to: '/admin/export', label: 'admin.export' },
  { to: '/admin/staff', label: 'admin.staff', ownerOnly: true },
  { to: '/admin/backups', label: 'admin.backups', ownerOnly: true },
  { to: '/admin/audit', label: 'admin.audit', ownerOnly: true },
];

// Every other page of the system, one click from the dashboard (owner, 20 Nov); each opens in a new tab.
const PAGES: Array<{ href: string; label: Key }> = [
  { href: '/', label: 'admin.page.register' },
  { href: '/display', label: 'admin.page.display' },
  { href: '/researchers', label: 'admin.page.researchers' },
  { href: '/verify', label: 'admin.page.verify' },
];

export function AdminLayout({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { role, email } = useAuth();
  return (
    <div className="admin">
      <nav className="admin-nav" aria-label={t('admin.title')}>
        <p className="admin-who">
          <strong>{t('admin.title')}</strong>
          <span dir="ltr">{email}</span>
        </p>
        {LINKS.filter((l) => !l.ownerOnly || role === 'owner').map((l) => (
          <NavLink key={l.to} to={l.to} end={l.to === '/admin'} className="admin-link">
            {t(l.label)}
          </NavLink>
        ))}
        <nav className="admin-pages" aria-label={t('admin.pages')}>
          <p className="admin-pages-title">{t('admin.pages')}</p>
          {PAGES.map((p) => (
            <a key={p.href} href={p.href} target="_blank" rel="noopener noreferrer" className="admin-link admin-link--out">
              <span>{t(p.label)}</span>
              <span aria-hidden="true" className="admin-out">↗</span>
            </a>
          ))}
        </nav>
      </nav>
      <section className="admin-main">{children}</section>
    </div>
  );
}

export function Stat({ label, value, tone }: { label: string; value: number | string; tone?: 'gold' | 'burgundy' }) {
  return (
    <div className={`stat ${tone ? `stat--${tone}` : ''}`}>
      <span>{label}</span>
      <strong className="num">{typeof value === 'number' ? value.toLocaleString('en-US') : value}</strong>
    </div>
  );
}
