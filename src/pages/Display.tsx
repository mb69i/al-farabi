import QRCode from 'qrcode';
import { IraqMap } from '../brand/IraqMap';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useI18n } from '../i18n';
import { ApiError, type Api, type DisplayCounts } from '../lib/api';
import './Display.css';

type Props = { api: Api; slug: string; pollMs?: number; animate?: boolean };

// Wording of the agenda's opening slide (owner, 20 Nov), always in Arabic as on the slide.
// TEDxBaghdad 2026 training at Al-Farabi (owner, 26 Nov): the 2026 theme leads, as on the theme reveal.
const WELCOME = 'جامعة الفارابي ترحب بكم في فعالية TEDxBaghdad';
const THEME_AR = 'ما لم نفقده يوماً';
const THEME_EN = 'What We Never Lost';
const WHEN = 'الجمعة 27 تشرين الثاني 2026 · جامعة الفارابي – بغداد'; // Al-Farabi hosts (owner, 26 Nov)

// The QR always sends guests to the live site, even when this screen is opened from a preview copy
// (whose address needs a Vercel login). VITE_SITE_URL can point it at a custom domain later.
const SITE = ((import.meta.env.VITE_SITE_URL as string | undefined) || 'https://tedx.mb-ai.org').replace(/\/+$/, '');

type CounterKey = Exclude<keyof DisplayCounts, 'researchers_total' | 'theme'>;
type Theme = 'day' | 'night';

// No VIP counter on the hall screen (owner, 19 Nov); VIP stays in the data, the dashboard and the Excel file.
const KEYS: CounterKey[] = ['total', 'present_today', 'male', 'female', 'researchers_signed'];
const BUMP_MS = 2200; // how long a number glows after it goes up

/** Hour of day in Baghdad (UTC+3 all year, no daylight saving). */
const baghdadHour = (now: number) => (new Date(now).getUTCHours() + 3) % 24;
const autoTheme = (now: number): Theme => {
  const h = baghdadHour(now);
  return h >= 18 || h < 6 ? 'night' : 'day';
};
const baghdadClock = (now: number) => {
  const d = new Date(now + 3 * 3600_000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};

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
  const [lastRegAt, setLastRegAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const prev = useRef<DisplayCounts | null>(null);
  const bumpTimer = useRef<number>();
  const [offline, setOffline] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);
  const [qr, setQr] = useState('');
  const target = `${SITE}/`;

  // The projector shows Arabic unless the URL asks for English (?lang=en).
  useEffect(() => {
    setLang(new URLSearchParams(window.location.search).get('lang') === 'en' ? 'en' : 'ar');
  }, [setLang]);

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
        setNotConfigured(false);
        if (!before) return;
        // Which numbers went up since the last poll (aggregates only, never who).
        const up: Partial<Record<CounterKey, number>> = {};
        for (const key of KEYS) {
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
        }
      } catch (e) {
        if (!alive) return;
        setOffline(true);
        // A build without the database settings can never connect: say so instead of "reconnecting".
        setNotConfigured(e instanceof ApiError && e.message === 'not configured');
      }
    };
    poll();
    const id = window.setInterval(poll, pollMs);
    return () => {
      alive = false;
      window.clearInterval(id);
      window.clearTimeout(bumpTimer.current);
    };
  }, [api, slug, pollMs]);

  // Clock, "N min ago", and the automatic day/night switch.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => window.clearInterval(id);
  }, []);

  // Staff shortcut on the projector PC: F or double-click = full screen. Day/night is set by an admin.
  useEffect(() => {
    const fullscreen = () => {
      if (document.fullscreenElement) void document.exitFullscreen?.();
      else void document.documentElement.requestFullscreen?.().catch(() => {});
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.toLowerCase() === 'f') fullscreen();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('dblclick', fullscreen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('dblclick', fullscreen);
    };
  }, []);

  const ago = (() => {
    if (lastRegAt === null) return null;
    const mins = Math.floor(Math.max(0, now - lastRegAt) / 60_000);
    if (mins < 1) return t('display.justNow');
    if (mins < 60) return t('display.minAgo', { n: String(mins) });
    return t('display.hoursAgo', { n: String(Math.floor(mins / 60)) });
  })();

  const n = (k: CounterKey | 'researchers_total') => Number(counts?.[k]) || 0;
  const people = n('male') + n('female');
  const malePct = people > 0 ? (n('male') / people) * 100 : 50;
  const theme: Theme = counts?.theme === 'day' || counts?.theme === 'night' ? counts.theme : autoTheme(now);

  /** One number in the strip, with its glow and "+N" badge (class names are what the tests read). */
  const stat = (key: CounterKey, label: string, extra: string, children?: ReactNode) => {
    const delta = bumps[key];
    return (
      <div className={`counter ${extra} ${delta ? 'counter--bump' : ''}`}>
        <span className="counter-value num">{counts ? <AnimatedNumber value={n(key)} animate={motion} /> : '—'}</span>
        <span className="counter-label">{label}</span>
        {delta ? (
          <span key={`${key}-${n(key)}`} className="counter-delta" aria-hidden="true">
            <bdi dir="ltr">+{delta}</bdi>
          </span>
        ) : null}
        {children}
      </div>
    );
  };

  return (
    <div className={`display ${motion ? '' : 'display--still'}`} data-theme={theme}>
      {/* Small corner controls, out of the way of the stage */}
      <div className="d-corner">
        <span className="d-clock num" data-testid="clock">
          {baghdadClock(now)}
        </span>
        {ago && (
          <span className="d-last" data-testid="last-reg">
            {t('display.lastReg', { when: ago })}
          </span>
        )}
      </div>

      {/* The theme artwork as the hall screen (owner, 26 Nov): logo top-left, 2026 THEME top-right, LOOK CLOSER!
          over the red disc, the theme, the numbers; on the right the QR on the dotted map of Iraq. */}
      <header className="d-top" dir="ltr">
        <div className="d-logos" dir="ltr">
          <img className="d-logo d-logo--tedx" src="/brand/tedx-baghdad-white-720.png" alt="TEDxBaghdad" />
          <span className="d-logos-sep" aria-hidden="true" />
          <img className="d-logo d-logo--crest" src="/brand/crest-360.webp" alt={t('brand.university')} />
        </div>
        <p className="d-year">
          <span className="d-year-num num">2026</span>
          <span className="d-year-word">THEME</span>
        </p>
      </header>

      <main className="d-stage" dir="ltr">
        <section className="d-scan">
          <IraqMap wrapClass="d-map-wrap" imgClass="d-map" />
            <div className="d-qr-frame">
              <div
                className="qr-box"
                data-testid="qr"
                data-target={target}
                role="img"
                aria-label={t('display.scan')}
                dangerouslySetInnerHTML={{ __html: qr }}
              />
            </div>
              <p className="qr-caption" dir="rtl">{t('display.scan')}</p>
        </section>

        <section className="d-poster">
          {/* Al-Farabi hosts the event (owner, 26 Nov: "تيدكس فارابي ترحب بكم"), as on the hosting poster */}
          <p className="d-welcome" lang="ar" dir="rtl">
            {WELCOME}
          </p>
          <span className="d-rule" aria-hidden="true" />
          <p className="d-headline" lang="en">
            LOOK CLOSER!
          </p>
          <p className="d-disc" lang="en">
            <span>It Was Always There!</span>
          </p>
          <h1 className="d-title" lang="ar" dir="rtl">
            {THEME_AR}
          </h1>
          <p className="d-theme-en" lang="en">
            {THEME_EN}
          </p>
            {notConfigured && (
              <p className="d-config" role="alert">
                {t('display.notConfigured')}
              </p>
            )}
                <div className="d-strip">
              {offline ? (
                <span className="d-live d-live--offline" role="status">
                  <span className="dot" aria-hidden="true" />
                  {t('display.reconnecting')}
                </span>
              ) : (
                <span className="d-live">
                  <span className="dot" aria-hidden="true" />
                  {t('display.live')}
                </span>
              )}
              {stat('total', t('display.total'), 'counter--main')}
              {stat('present_today', t('display.today'), '')}
              <div className="d-gender">
                <div className="d-gender-nums">
                  {stat('male', t('display.male'), 'counter--male')}
                  {stat('female', t('display.female'), 'counter--female')}
                </div>
                <div
                  className="d-split"
                  role="img"
                  aria-label={`${t('display.male')} ${n('male')} · ${t('display.female')} ${n('female')}`}
                >
                  <span className="d-split-male" style={{ width: `${malePct}%` }} />
                  <span className="d-split-female" />
                </div>
              </div>
            </div>
              <p className="d-when" lang="ar" dir="rtl">
            {WHEN}
          </p>
        </section>
      </main>

    </div>
  );
}
