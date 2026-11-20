import { useMemo } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { createAdminApi } from './admin/adminApi';
import { AdminApiProvider, AdminLayout } from './admin/AdminLayout';
import { AdminResearchers, Deliveries, Guests, Overview, SwitchesPage } from './admin/pages';
import { AuditPage, ExportPage, StaffPage, TemplateStudio } from './admin/pages2';
import { BackupDevicesPage } from './admin/BackupDevices';
import { useAuth } from './auth/AuthProvider';
import { Shell } from './components/Shell';
import { useI18n } from './i18n';
import { createStaffApi } from './lib/staffApi';
import { EVENT_SLUG, supabase } from './lib/supabase';
import { Researchers } from './pages/Researchers';

function SignOut() {
  const { t } = useI18n();
  const { signOut } = useAuth();
  return (
    <button type="button" className="lang-toggle" onClick={() => void signOut()}>
      {t('staff.signOut')}
    </button>
  );
}

/** Staff-only screens, loaded on demand so the public page stays small. */
export default function StaffRoutes({ area }: { area: 'researchers' | 'admin' }) {
  const staff = useMemo(() => createStaffApi(supabase!, EVENT_SLUG), []);
  const admin = useMemo(() => createAdminApi(supabase!, EVENT_SLUG), []);
  const { role } = useAuth();

  if (area === 'researchers') {
    return (
      <Shell variant="staff" actions={<SignOut />} ministry>
        <Researchers search={staff.searchResearchers} submit={staff.signOff} />
      </Shell>
    );
  }
  return (
    <Shell variant="staff" actions={<SignOut />}>
      <AdminApiProvider value={admin}>
        <AdminLayout>
          <Routes>
            <Route index element={<Overview />} />
            <Route path="guests" element={<Guests />} />
            <Route path="researchers" element={<AdminResearchers />} />
            <Route path="deliveries" element={<Deliveries />} />
            <Route path="switches" element={<SwitchesPage />} />
            <Route path="templates" element={<TemplateStudio />} />
            <Route path="export" element={<ExportPage />} />
            {role === 'owner' && <Route path="staff" element={<StaffPage />} />}
            {role === 'owner' && <Route path="backups" element={<BackupDevicesPage />} />}
            {role === 'owner' && <Route path="audit" element={<AuditPage />} />}
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </AdminLayout>
      </AdminApiProvider>
    </Shell>
  );
}
