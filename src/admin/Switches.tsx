import { useState } from 'react';
import { useI18n, type Key } from '../i18n';

export type SwitchState = { registration_open: boolean; cards_enabled: boolean; certificates_enabled: boolean };

const ITEMS: Array<{ key: keyof SwitchState; label: Key }> = [
  { key: 'registration_open', label: 'admin.registrationOpen' },
  { key: 'cards_enabled', label: 'admin.cardsEnabled' },
  { key: 'certificates_enabled', label: 'admin.certificatesEnabled' },
];

/** Big on/off controls. Turning something off asks first; turning on is immediate. */
export function Switches({ value, onSave }: { value: SwitchState; onSave: (next: SwitchState) => Promise<unknown> }) {
  const { t } = useI18n();
  const [pending, setPending] = useState<keyof SwitchState | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(next: SwitchState) {
    setBusy(true);
    try {
      await onSave(next);
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  return (
    <div className="switches">
      {ITEMS.map(({ key, label }) => (
        <div key={key} className={`switch-card ${value[key] ? 'is-on' : ''}`}>
          <span className="switch-label" id={`sw-${key}`}>
            {t(label)}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={value[key]}
            aria-labelledby={`sw-${key}`}
            className="switch"
            disabled={busy}
            onClick={() => (value[key] ? setPending(key) : void save({ ...value, [key]: true }))}
          >
            <span className="switch-knob" />
          </button>
          {pending === key && (
            <div className="switch-confirm" role="alertdialog" aria-labelledby={`swc-${key}`}>
              <p id={`swc-${key}`}>{t('admin.confirmOff')}</p>
              <div>
                <button type="button" className="btn-danger" onClick={() => void save({ ...value, [key]: false })}>
                  {t('admin.save')}
                </button>
                <button type="button" className="btn-ghost" onClick={() => setPending(null)}>
                  {t('admin.cancel')}
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
