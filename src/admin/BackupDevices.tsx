import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useI18n } from '../i18n';
import type { BackupCode, BackupDevice } from './adminApi';
import { useAdminApi } from './AdminLayout';

/** A switched-on device that has not backed up for this long is flagged (the PC backs up every 5 minutes). */
const LATE_MIN = 15;

/** Owner: laptops/PCs that keep a backup copy. Add (one-time pairing code), switch on/off, delete. */
export function BackupDevicesPage() {
  const { t } = useI18n();
  const api = useAdminApi();
  const [devices, setDevices] = useState<BackupDevice[] | null>(null);
  const [name, setName] = useState('');
  const [pairing, setPairing] = useState<BackupCode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(
    () =>
      api
        .listBackupDevices()
        .then((d) => {
          setDevices(d);
          setNow(Date.now());
        })
        .catch((e: Error) => setError(e.message)),
    [api],
  );
  useEffect(() => void load(), [load]);
  useEffect(() => {
    const id = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    await act(async () => {
      setPairing(await api.addBackupDevice(name.trim()));
      setName('');
    });
  }

  const ago = (iso: string | null) => {
    if (!iso) return t('admin.backupNever');
    const min = Math.floor(Math.max(0, now - new Date(iso).getTime()) / 60_000);
    if (min < 1) return t('admin.justNow');
    if (min < 120) return t('admin.minAgo', { n: String(min) });
    return t('admin.hoursAgo', { n: String(Math.floor(min / 60)) });
  };
  const late = (d: BackupDevice) =>
    d.enabled && d.paired && (!d.last_seen_at || now - new Date(d.last_seen_at).getTime() > LATE_MIN * 60_000);

  return (
    <>
      <h1 className="admin-h1">{t('admin.backups')}</h1>
      <p className="admin-count">{t('admin.backupsLead')}</p>

      <form className="admin-panel backup-add" aria-label={t('admin.backupAddTitle')} onSubmit={(e) => void add(e)}>
        <h2 className="admin-h2">{t('admin.backupAddTitle')}</h2>
        <label>
          {t('admin.backupName')}
          <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        </label>
        <button type="submit" className="btn-primary" disabled={name.trim().length < 2}>
          {t('admin.backupAdd')}
        </button>
      </form>

      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}

      {pairing && (
        <section className="admin-panel backup-pair" aria-label={t('admin.backupPairTitle', { name: pairing.label })}>
          <h2 className="admin-h2">{t('admin.backupPairTitle', { name: pairing.label })}</h2>
          <p className="backup-code num" dir="ltr">
            {pairing.code}
          </p>
          <p className="admin-count">
            {t('admin.backupCodeExpires', {
              time: new Date(pairing.expires_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Baghdad' }),
            })}
          </p>
          <ol className="backup-steps">
            <li>{t('admin.backupStep1')}</li>
            <li>
              {t('admin.backupStep2')}{' '}
              <a href="/backup/backup.py" download dir="ltr">
                backup.py
              </a>
            </li>
            <li>
              {t('admin.backupStep3')}
              <code className="backup-cmd" dir="ltr">{`python backup.py pair ${pairing.code}`}</code>
            </li>
            <li>{t('admin.backupStep4')}</li>
          </ol>
        </section>
      )}

      {devices && devices.length === 0 && <p className="admin-count">{t('admin.backupEmpty')}</p>}
      {devices && devices.length > 0 && (
        <div className="table-wrap">
          <table className="admin-table backup-table">
            <thead>
              <tr>
                <th>{t('admin.backupColName')}</th>
                <th>{t('admin.backupColOn')}</th>
                <th>{t('admin.backupColLast')}</th>
                <th>{t('admin.backupColPair')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <tr key={d.id}>
                  <td className="backup-name">
                    <strong dir="auto">{d.label}</strong>
                  </td>
                  <td className="backup-on">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={d.enabled}
                      aria-label={t('admin.backupOnFor', { name: d.label })}
                      className="switch"
                      onClick={() => void act(() => api.setBackupDevice(d.id, !d.enabled))}
                    >
                      <span className="switch-knob" />
                    </button>
                  </td>
                  <td>
                    {ago(d.last_seen_at)}
                    {late(d) && <div className="backup-late">{t('admin.backupLate')}</div>}
                  </td>
                  <td>
                    {d.paired ? (
                      t('admin.backupPaired')
                    ) : (
                      <span className="backup-waiting">
                        {t('admin.backupWaiting')}{' '}
                        <button type="button" className="btn-ghost" onClick={() => void act(async () => setPairing(await api.newBackupCode(d.id)))}>
                          {t('admin.backupNewCode')}
                        </button>
                      </span>
                    )}
                  </td>
                  <td className="backup-actions">
                    <button
                      type="button"
                      className="btn-danger"
                      onClick={() => {
                        if (window.confirm(t('admin.backupConfirmDelete', { name: d.label }))) {
                          void act(() => api.deleteBackupDevice(d.id));
                        }
                      }}
                    >
                      {t('admin.backupDelete')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
