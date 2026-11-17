import { useEffect, useState } from 'react';
import { useI18n, type Key } from '../i18n';

export type HallThemeValue = 'auto' | 'day' | 'night';

const OPTIONS: Array<{ value: HallThemeValue; label: Key }> = [
  { value: 'auto', label: 'admin.hallAuto' },
  { value: 'day', label: 'admin.hallDay' },
  { value: 'night', label: 'admin.hallNight' },
];

/** Admin → Controls: day/night for the hall screen. Saves on tap; the hall screen follows within seconds. */
export function HallTheme({ value, onSave }: { value: HallThemeValue; onSave: (v: HallThemeValue) => Promise<unknown> }) {
  const { t } = useI18n();
  const [current, setCurrent] = useState(value);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => setCurrent(value), [value]);

  async function choose(v: HallThemeValue) {
    if (v === current || busy) return;
    const before = current;
    setCurrent(v);
    setBusy(true);
    setMsg(null);
    try {
      await onSave(v);
      setMsg(t('admin.saved'));
    } catch (e) {
      setCurrent(before);
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <fieldset className="admin-panel hall-theme" style={{ maxWidth: 620 }}>
      <legend className="admin-h2">{t('admin.hallTheme')}</legend>
      <p className="admin-count">{t('admin.hallThemeHint')}</p>
      <div className="hall-theme-options">
        {OPTIONS.map((o) => (
          <label key={o.value} className={`hall-theme-option ${current === o.value ? 'is-on' : ''}`}>
            <input
              type="radio"
              name="hall-theme"
              value={o.value}
              checked={current === o.value}
              disabled={busy}
              onChange={() => void choose(o.value)}
            />
            <span>{t(o.label)}</span>
          </label>
        ))}
      </div>
      {msg && (
        <p className="admin-count" role="status">
          {msg}
        </p>
      )}
    </fieldset>
  );
}
