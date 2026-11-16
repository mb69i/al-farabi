import { useMemo } from 'react';
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
  if (area === 'researchers') {
    return (
      <Shell variant="staff" actions={<SignOut />}>
        <Researchers search={staff.searchResearchers} submit={staff.signOff} />
      </Shell>
    );
  }
  return (
    <Shell variant="staff" actions={<SignOut />}>
      <p>admin</p>
    </Shell>
  );
}
