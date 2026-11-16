import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useAuth, type Role } from './AuthProvider';
import { useIdleLogout } from './useIdleLogout';

const IDLE_MINUTES: Record<Role, number> = { owner: 15, admin: 15, doctor: 30 };
const STRONG: Role[] = ['owner', 'admin'];

function IdleGuard({ role }: { role: Role }) {
  const { signOut } = useAuth();
  useIdleLogout(IDLE_MINUTES[role], () => {
    void signOut().then(() => {
      window.location.assign('/staff/login?idle=1');
    });
  });
  return null;
}

export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { loading, session, role, aal } = useAuth();
  const { t } = useI18n();
  const location = useLocation();

  if (loading) return <div className="auth-wait" aria-busy="true" />;
  if (!session) return <Navigate to="/staff/login" replace state={{ from: location.pathname }} />;
  if (role && STRONG.includes(role) && aal !== 'aal2') {
    return <Navigate to="/staff/mfa" replace state={{ from: location.pathname }} />;
  }
  if (!role || !roles.includes(role)) {
    return (
      <p className="auth-denied" role="alert">
        {t('staff.noAccess')}
      </p>
    );
  }
  return (
    <>
      <IdleGuard role={role} />
      {children}
    </>
  );
}
