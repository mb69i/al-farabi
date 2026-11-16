import { Shell } from './components/Shell';
import { useI18n } from './i18n';

export default function App() {
  const { t } = useI18n();
  return (
    <Shell>
      <h1 style={{ fontSize: 'var(--fs-xl)' }}>{t('brand.conferenceLong')}</h1>
    </Shell>
  );
}
