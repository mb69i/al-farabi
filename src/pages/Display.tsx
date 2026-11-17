import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';
import { useI18n, type Key } from '../i18n';
import type { Api, DisplayCounts } from '../lib/api';
import './Display.css';

type Props = { api: Api; slug: string; pollMs?: number; animate?: boolean };

type CounterKey = Exclude<keyof DisplayCounts, 'researchers_total'>;

const COUNTERS: Array<{ key: CounterKey; label: Key; tone?: 'gold' | 'burgundy' }> = [
  { key: 'male', label: 'display.male' },
  { key: 'female', label: 'display.female' },
  { key: 'vip', label: 'display.vip', tone: 'gold' },
  { key: 'researchers_signed', label: 'display.researchers', tone: 'burgundy' },
  { key: 'total', label: 'display.total' },
  { key: 'present_today', label: 'display.today' },
];

const BUMP_MS = 2200; // how long a counter glows after its number goes up
const MOMENT_MS = 6000; // how long "Welcome, guest no. N" stays up

/** True when the viewer's system asks for less motion (projector PCs can set this too). */
function usePrefersReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)';
  const get = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
  const [reduced, setReduced] = useState(get);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return reduced;
}

/** Counts up to the value (from zero on start), easing out; shows the number at once without motion. */
function AnimatedNumber({ value, animate }: { value: number; animate: boolean }) {
  const [shown, setShown] = useState(animate ? 0 : value);
  const from = useRef(animate ? 0 : value);
  useEffect(() => {
    if (!animate || typeof requestAnimationFrame === 'undefined') {
      from.current = value;
      setShown(value);
      return;
    }
    const start = performance.now();
    const a = from.current;
    const duration = a === 0 ? 1600 : 900;
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const v = Math.round(a + (value - a) * (1 - (1 - p) ** 3));
      from.current = v;
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, animate]);
  return <>{shown.toLocaleString('en-US')}</>;
}

export function Display({ api, slug, pollMs = 5000, animate = true }: Props) {
  const { t, setLang } = useI18n();
  const reduced = usePrefersReducedMotion();
  const motion = animate && !reduced;
  const [counts, setCounts] = useState<DisplayCounts | null>(null);
  const [bumps, setBumps] = useState<Partial<Record<CounterKey, number>>>({});
  const [moment, setMoment] = useState<{ n: number; id: number } | null>(null);
  const [lastRegAt, setLastRegAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const prev = useRef<DisplayCounts | null>(null);
  const bumpTimer = useRef<number>();
  const momentTimer = useRef<number>();

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
        const before = prev.current;
        prev.current = c;
        setCounts(c);
        setOffline(false);
        if (!before) return;
        // Which numbers went up since the last poll (aggregates only, never who).
        const up: Partial<Record<CounterKey, number>> = {};
        for (const { key } of COUNTERS) {
          const d = (Number(c[key]) || 0) - (Number(before[key]) || 0);
          if (d > 0) up[key] = d;
        }
        if (Object.keys(up).length) {
          setBumps(up);
          window.clearTimeout(bumpTimer.current);
          bumpTimer.current = window.setTimeout(() => setBumps({}), BUMP_MS);
        }
        if (up.total) {
          setLastRegAt(Date.now());
          setNow(Date.now());
          setMoment({ n: Number(c.total), id: Date.now() });
          window.clearTimeout(momentTimer.current);
          momentTimer.current = window.setTimeout(() => setMoment(null), MOMENT_MS);
        }
      } catch {
        if (alive) setOffline(true);
      }
    };
    poll();
    const id = window.setInterval(poll, pollMs);
    return () => {
      alive = false;
      window.clearInterval(id);
      window.clearTimeout(bumpTimer.current);
      window.clearTimeout(momentTimer.current);
    };
  }, [api, slug, pollMs]);

  // Keep "last registration: N min ago" current.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => window.clearInterval(id);
  }, []);

  // Staff convenience on the projector PC: F or a double-click toggles full screen.
  useEffect(() => {
    const toggle = () => {
      if (document.fullscreenElement) void document.exitFullscreen?.();
      else void document.documentElement.requestFullscreen?.().catch(() => {});
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey && !e.altKey) toggle();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('dblclick', toggle);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('dblclick', toggle);
    };
  }, []);

  const ago = (() => {
    if (lastRegAt === null) return null;
    const mins = Math.floor(Math.max(0, now - lastRegAt) / 60_000);
    if (mins < 1) return t('display.justNow');
    if (mins < 60) return t('display.minAgo', { n: String(mins) });
    return t('display.hoursAgo', { n: String(Math.floor(mins / 60)) });
  })();

  const signed = Number(counts?.researchers_signed) || 0;
  const researchersTotal = Number(counts?.researchers_total) || 0;
  const pct = researchersTotal ? Math.min(100, Math.round((signed / researchersTotal) * 100)) : 0;

  return (
    <div className={`display ${motion ? '' : 'display--still'}`}>
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
        <div className="display-status">
          {ago && (
            <span className="display-last" data-testid="last-reg">
              {t('display.lastReg', { when: ago })}
            </span>
          )}
          {offline ? (
            <span className="display-offline" role="status">
              <span className="dot" aria-hidden="true" />
              {t('display.reconnecting')}
            </span>
          ) : (
            <span className="display-live">
              <span className="dot" aria-hidden="true" />
              {t('display.live')}
            </span>
          )}
        </div>
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
          {/* One fixed-height slot: the site address, or for a few seconds the welcome moment. */}
          <div className="qr-foot">
            {moment ? (
              <div className="display-moment" data-testid="moment" role="status" key={moment.id}>
                <span className="display-moment-spark" aria-hidden="true">✦</span>
                {t('display.moment', { n: moment.n.toLocaleString('en-US') })}
              </div>
            ) : (
              <p className="qr-url num">{target.replace(/^https?:\/\//, '').replace(/\/$/, '')}</p>
            )}
          </div>
        </section>

        <section className="display-grid">
          {COUNTERS.map((c) => {
            const delta = bumps[c.key];
            return (
              <div
                key={c.key}
                className={`counter ${c.tone ? `counter--${c.tone}` : ''} ${delta ? 'counter--bump' : ''}`}
              >
                <span className="counter-label">{t(c.label)}</span>
                <span className="counter-value num">
                  {counts ? <AnimatedNumber value={Number(counts[c.key]) || 0} animate={motion} /> : '—'}
                </span>
                {delta ? (
                  <span key={`${c.key}-${counts?.[c.key]}`} className="counter-delta num" aria-hidden="true">
                    +{delta}
                  </span>
                ) : null}
                {c.key === 'researchers_signed' && counts && researchersTotal > 0 && (
                  <div className="counter-progress-wrap">
                    <div
                      className="counter-progress"
                      role="progressbar"
                      aria-label={t('display.researchers')}
                      aria-valuemin={0}
                      aria-valuemax={researchersTotal}
                      aria-valuenow={signed}
                    >
                      <span style={{ width: `${pct}%` }} />
                    </div>
                    <span className="counter-sub num">{t('display.ofTotal', { n: researchersTotal.toLocaleString('en-US') })}</span>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      </main>

    </div>
  );
}
