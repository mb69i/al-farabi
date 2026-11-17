import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Shell } from '../components/Shell';
import { ThanksRobot } from '../components/ThanksRobot';
import { useI18n, type Key } from '../i18n';
import type { Api, Gender } from '../lib/api';
import { normalizeEmail, normalizePhone, suggestEmailFix } from '../lib/normalize';
import { clearPass, loadPass, savePass, type Pass } from '../lib/pass';
import './Register.css';

type Field = 'fullName' | 'phone' | 'email' | 'gender' | 'workplace' | 'specialization';
type Values = Record<Field, string>;
type View = 'loading' | 'form' | 'done' | 'closed' | 'error' | 'busy';
type Outcome = 'created' | 'already' | 'returning';

const EMPTY: Values = { fullName: '', phone: '', email: '', gender: '', workplace: '', specialization: '' };

function validate(field: Field, v: string): Key | null {
  const s = v.trim();
  switch (field) {
    case 'fullName':
      return s.length < 3 || s.length > 120 ? 'err.name' : null;
    case 'phone':
      return !s ? 'err.required' : normalizePhone(s) ? null : 'err.phone';
    case 'email':
      return !s ? 'err.required' : normalizeEmail(s) ? null : 'err.email';
    case 'gender':
      return s ? null : 'err.choose';
    case 'workplace':
    case 'specialization':
      return !s ? 'err.required' : s.length < 2 ? 'err.short' : null;
  }
}

const FIELDS: Field[] = ['fullName', 'phone', 'email', 'gender', 'workplace', 'specialization'];
const SERVER_FIELD: Record<string, Field> = {
  full_name: 'fullName', phone: 'phone', email: 'email', gender: 'gender',
  workplace: 'workplace', specialization: 'specialization',
};

export function Register({ api, slug }: { api: Api; slug: string }) {
  const { t, lang } = useI18n();
  const [view, setView] = useState<View>('loading');
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<Field, Key>>>({});
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [pass, setPass] = useState<Pass | null>(null);
  const [outcome, setOutcome] = useState<Outcome>('created');
  const [checkedIn, setCheckedIn] = useState(false);
  const honeypot = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = loadPass(slug);
    if (saved) {
      setPass(saved);
      setOutcome('returning');
      setView('done');
      return;
    }
    let alive = true;
    api
      .getPublicEvent(slug)
      .then((ev) => alive && setView(ev && ev.registration_open === false ? 'closed' : 'form'))
      .catch(() => alive && setView('form'));
    return () => {
      alive = false;
    };
  }, [api, slug]);

  const set = (f: Field, v: string) => {
    setValues((s) => ({ ...s, [f]: v }));
    if (errors[f]) setErrors((e) => ({ ...e, [f]: validate(f, v) ?? undefined }));
  };

  const blur = (f: Field) => {
    setErrors((e) => ({ ...e, [f]: validate(f, values[f]) ?? undefined }));
    if (f === 'email') setSuggestion(suggestEmailFix(values.email.trim()));
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (inFlight.current) return;
    const next: Partial<Record<Field, Key>> = {};
    for (const f of FIELDS) {
      const err = validate(f, values[f]);
      if (err) next[f] = err;
    }
    setErrors(next);
    const first = FIELDS.find((f) => next[f]);
    if (first) {
      document.getElementById(`f-${first}`)?.focus();
      return;
    }

    const firstName = values.fullName.trim().split(/\s+/)[0];
    if (honeypot.current?.value) {
      setPass({ serial: '', firstName, phone: '', lang });
      setOutcome('created');
      setView('done');
      return;
    }

    inFlight.current = true;
    setBusy(true);
    try {
      const res = await api.registerGuest({
        fullName: values.fullName,
        phone: values.phone,
        email: values.email,
        gender: values.gender as Gender,
        workplace: values.workplace,
        specialization: values.specialization,
        lang,
      });
      if (res.status === 'closed') return setView('closed');
      if (res.status === 'rate_limited') return setView('busy');
      if (res.status === 'invalid') {
        const f = SERVER_FIELD[res.field ?? ''] ?? 'fullName';
        setErrors({ [f]: f === 'phone' ? 'err.phone' : f === 'email' ? 'err.email' : 'err.required' });
        return;
      }
      const p: Pass = { serial: res.serial ?? '', firstName, phone: normalizePhone(values.phone) ?? values.phone, lang };
      savePass(slug, p);
      setPass(p);
      setCheckedIn(res.checked_in_today);
      setOutcome(res.status === 'already_registered' ? 'already' : 'created');
      setView('done');
    } catch {
      setView('error');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function checkinToday() {
    if (!pass || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const res = await api.checkinGuest(slug, pass.serial, pass.phone);
      if (res.status === 'ok') setCheckedIn(true);
      else if (res.status === 'closed') setView('closed');
      else if (res.status === 'rate_limited') setView('busy');
    } catch {
      /* keep the button; the guest can tap again */
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function registerSomeoneElse() {
    clearPass(slug);
    setPass(null);
    setValues(EMPTY);
    setCheckedIn(false);
    setView('form');
  }

  const fieldProps = (f: Field) => ({
    id: `f-${f}`,
    value: values[f],
    onChange: (e: { target: { value: string } }) => set(f, e.target.value),
    onBlur: () => blur(f),
    'aria-invalid': errors[f] ? true : undefined,
    'aria-describedby': `h-${f}`,
  });

  const Err = ({ f }: { f: Field }) =>
    errors[f] ? (
      <p className="field-error" id={`e-${f}`} role="alert">
        {t(errors[f]!)}
      </p>
    ) : null;

  return (
    <Shell>
      <section className="reg-hero">
        <p className="reg-kicker">
          {t('brand.edition')} · <span className="num">2026</span>
        </p>
        <h1 className="reg-title">{t('brand.conferenceLong')}</h1>
        <p className="reg-meta">
          <span>{t('brand.dates')}</span>
          <span>{t('brand.place')}</span>
        </p>
      </section>

      {view === 'loading' && <div className="reg-card reg-card--loading" aria-busy="true" />}

      {view === 'closed' && (
        <section className="reg-card reg-panel">
          <h2>{t('reg.closedTitle')}</h2>
          <p>{t('reg.closedBody')}</p>
        </section>
      )}

      {view === 'busy' && (
        <section className="reg-card reg-panel" role="alert">
          <h2>{t('reg.busyTitle')}</h2>
          <p>{t('reg.busyBody')}</p>
          <button type="button" className="btn-primary" onClick={() => setView('form')}>
            {t('reg.retry')}
          </button>
        </section>
      )}

      {view === 'error' && (
        <section className="reg-card reg-panel" role="alert">
          <h2>{t('reg.errorTitle')}</h2>
          <p>{t('reg.errorBody')}</p>
          <button type="button" className="btn-primary" onClick={() => setView('form')}>
            {t('reg.retry')}
          </button>
        </section>
      )}

      {view === 'done' && pass && (
        <section className="reg-done">
          <ThanksRobot message={t('thanks.robot', { name: pass.firstName })} label={lang === 'ar' ? 'روبوت الفارابي' : 'Al-Farabi robot'} />
          <div className="reg-card pass-card">
            <h2 className="pass-heading">{outcome === 'created' ? t('thanks.title') : t('pass.title')}</h2>
            {outcome === 'already' && <p className="pass-note">{t('thanks.already')}</p>}
            {outcome === 'created' && <p className="pass-note">{t('thanks.emailNote')}</p>}
            {pass.serial && (
              <div className="pass-serial">
                <span>{t('pass.serial')}</span>
                <strong className="num">{pass.serial}</strong>
              </div>
            )}
            {outcome === 'returning' &&
              (checkedIn ? (
                <p className="pass-ok" role="status">
                  {t('pass.checkedIn')}
                </p>
              ) : (
                <button type="button" className="btn-primary" disabled={busy} onClick={checkinToday}>
                  {t('pass.checkinToday')}
                </button>
              ))}
            <button type="button" className="btn-link" onClick={registerSomeoneElse}>
              {t('pass.notYou')}
            </button>
          </div>
        </section>
      )}

      {view === 'form' && (
        <form className="reg-card reg-form" onSubmit={submit} noValidate>
          <header className="reg-form-head">
            <h2>{t('reg.title')}</h2>
            <p>{t('reg.lead')}</p>
          </header>

          <div className={`field ${errors.fullName ? 'has-error' : ''}`}>
            <label htmlFor="f-fullName">{t('reg.fullName')}</label>
            <input {...fieldProps('fullName')} autoComplete="name" maxLength={120} />
            <p className="field-hint" id="h-fullName">{t('reg.fullNameHint')}</p>
            <Err f="fullName" />
          </div>

          <div className={`field ${errors.phone ? 'has-error' : ''}`}>
            <label htmlFor="f-phone">{t('reg.phone')}</label>
            <input {...fieldProps('phone')} type="tel" inputMode="tel" autoComplete="tel" dir="ltr" maxLength={24} />
            <p className="field-hint" id="h-phone">{t('reg.phoneHint')}</p>
            <Err f="phone" />
          </div>

          <div className={`field ${errors.email ? 'has-error' : ''}`}>
            <label htmlFor="f-email">{t('reg.email')}</label>
            <input {...fieldProps('email')} type="email" inputMode="email" autoComplete="email" dir="ltr" maxLength={254} />
            <p className="field-hint" id="h-email">{t('reg.emailHint')}</p>
            {suggestion && (
              <p className="field-suggest">
                <span>{t('reg.didYouMean', { email: suggestion })}</span>
                <button
                  type="button"
                  onClick={() => {
                    set('email', suggestion);
                    setSuggestion(null);
                  }}
                >
                  {t('reg.useSuggestion')}
                </button>
              </p>
            )}
            <Err f="email" />
          </div>

          <fieldset className={`field choice ${errors.gender ? 'has-error' : ''}`} id="f-gender" tabIndex={-1}>
            <legend>{t('reg.gender')}</legend>
            <div className="choice-row">
              {(['male', 'female'] as const).map((g) => (
                <label key={g} className="chip">
                  <input type="radio" name="gender" value={g} checked={values.gender === g} onChange={() => set('gender', g)} />
                  <span>{t(g === 'male' ? 'reg.male' : 'reg.female')}</span>
                </label>
              ))}
            </div>
            <Err f="gender" />
          </fieldset>

          <div className={`field ${errors.workplace ? 'has-error' : ''}`}>
            <label htmlFor="f-workplace">{t('reg.workplace')}</label>
            <input {...fieldProps('workplace')} autoComplete="organization" maxLength={160} />
            <Err f="workplace" />
          </div>

          <div className={`field ${errors.specialization ? 'has-error' : ''}`}>
            <label htmlFor="f-specialization">{t('reg.specialization')}</label>
            <input {...fieldProps('specialization')} maxLength={160} />
            <Err f="specialization" />
          </div>

          <div className="hp" aria-hidden="true">
            <label htmlFor="f-website">Website</label>
            <input ref={honeypot} id="f-website" name="website" tabIndex={-1} autoComplete="off" />
          </div>

          <button type="submit" className="btn-primary btn-block" disabled={busy}>
            {busy ? t('reg.submitting') : t('reg.submit')}
          </button>
        </form>
      )}
    </Shell>
  );
}
