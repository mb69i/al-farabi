import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';
import { useI18n, type Key } from '../i18n';
import type { Api, DisplayCounts } from '../lib/api';
import './Display.css';

type Props = { api: Api; slug: string; pollMs?: number; animate?: boolean };

const COUNTERS: Array<{ key: keyof DisplayCounts; label: Key; tone?: 'gold' | 'burgundy' }> = [
  { key: 'male', label: 'display.male' },
  { key: 'female', label: 'display.female' },
  { key: 'vip', label: 'display.vip', tone: 'gold' },
  { key: 'researchers_signed', label: 'display.researchers', tone: 'burgundy' },
  { key: 'total', label: 'display.total' },
  { key: 'present_today', label: 'display.today' },
];

function AnimatedNumber({ value, animate }: { value: number; animate: boolean }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (!animate || typeof requestAnimationFrame === 'undefined') {
      setShown(value);
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / 900);
      setShown(Math.round(a + (value - a) * (1 - (1 - p) ** 3)));
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, animate]);
  return <>{shown.toLocaleString('en-US')}</>;
}

export function Display({ api, slug, pollMs = 5000, animate = true }: Props) {
  const { t, setLang } = useI18n();
  const [counts, setCounts] = useState<DisplayCounts | null>(null);

  // The projector shows Arabic unless the URL asks for English (?lang=en).
  useEffect(() => {
    setLang(new URLSearchParams(window.location.search).get('lang') === 'en' ? 'en' : 'ar');
  }, [setLang]);
  const [offline, setOffline] = useState(false);
  const [qr, setQr] = useState('');
  const target = `${window.location.origin}/`;

  useEffect(() => {
    QRCode.toString(target, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0C1733', light: '#FFFFFF' } })
      .then(setQr)
      .catch(() => setQr(''));
  }, [target]);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const c = await api.getDisplayCounts(slug);
        if (!alive) return;
        setCounts(c);
        setOffline(false);
      } catch {
        if (alive) setOffline(true);
      }
    };
    poll();
    const id = window.setInterval(poll, pollMs);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [api, slug, pollMs]);

  return (
    <div className="display">
      <header className="display-head">
        <div className="display-brand">
          <span className="display-crest">
            <img src="/brand/crest-192.png" alt={t('brand.university')} />
          </span>
          <div>
            <h1>{t('brand.conferenceLong')}</h1>
            <p>
              {t('brand.slogan')} · {t('brand.dates')}
            </p>
          </div>
        </div>
        {offline && (
          <span className="display-offline" role="status">
            <span className="dot" aria-hidden="true" />
            {t('display.reconnecting')}
          </span>
        )}
      </header>

      <main className="display-body">
        <section className="display-qr">
          <div
            className="qr-box"
            data-testid="qr"
            data-target={target}
            role="img"
            aria-label={t('display.scan')}
            dangerouslySetInnerHTML={{ __html: qr }}
          />
          <p className="qr-caption">{t('display.scan')}</p>
          <p className="qr-url num">{target.replace(/^https?:\/\//, '').replace(/\/$/, '')}</p>
        </section>

        <section className="display-grid">
          {COUNTERS.map((c) => (
            <div key={c.key} className={`counter ${c.tone ? `counter--${c.tone}` : ''}`}>
              <span className="counter-label">{t(c.label)}</span>
              <span className="counter-value num">
                {counts ? <AnimatedNumber value={Number(counts[c.key]) || 0} animate={animate} /> : '—'}
              </span>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
