import { useEffect, useState } from 'react';
import './ThanksRobot.css';

type Props = { message: string; label?: string };

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** The university's humanoid robot, waving and "typing" its thanks. Lightweight inline SVG. */
export function ThanksRobot({ message, label = 'Al-Farabi robot' }: Props) {
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? message.length : 0));

  useEffect(() => {
    if (prefersReducedMotion()) {
      setShown(message.length);
      return;
    }
    setShown(0);
    const chars = Array.from(message);
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setShown(i);
      if (i >= chars.length) window.clearInterval(id);
    }, 28);
    return () => window.clearInterval(id);
  }, [message]);

  const typed = Array.from(message).slice(0, shown).join('');

  return (
    <div className="robot-scene">
      <div className="robot-bubble" aria-live="polite">
        <span className="sr-only">{message}</span>
        <span aria-hidden="true">
          {typed}
          {shown < Array.from(message).length && <span className="robot-caret" />}
        </span>
      </div>
      <svg className="robot" viewBox="0 0 220 260" role="img" aria-label={label}>
        <defs>
          <linearGradient id="rb-metal" x1="0" x2="1">
            <stop offset="0" stopColor="#8E96A3" />
            <stop offset="0.45" stopColor="#F1F3F6" />
            <stop offset="1" stopColor="#A7AEB9" />
          </linearGradient>
          <linearGradient id="rb-visor" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#2B3142" />
            <stop offset="1" stopColor="#07090F" />
          </linearGradient>
          <radialGradient id="rb-eye">
            <stop offset="0" stopColor="#FFFFFF" />
            <stop offset="0.5" stopColor="#7FE3FF" />
            <stop offset="1" stopColor="#7FE3FF" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* waving arm (behind torso) */}
        <g className="robot-arm-wave">
          <rect x="148" y="70" width="20" height="62" rx="10" fill="url(#rb-metal)" />
          <rect x="150" y="34" width="18" height="44" rx="9" fill="url(#rb-metal)" />
          <circle cx="159" cy="28" r="12" fill="#1A1D24" />
        </g>
        {/* resting arm */}
        <rect x="46" y="96" width="20" height="96" rx="10" fill="url(#rb-metal)" />
        <circle cx="56" cy="198" r="12" fill="#1A1D24" />

        {/* neck + head */}
        <rect x="100" y="64" width="20" height="16" rx="4" fill="#2A2F3A" />
        <g className="robot-head">
          <rect x="82" y="10" width="56" height="58" rx="24" fill="#1F2430" />
          <rect x="88" y="18" width="44" height="34" rx="16" fill="url(#rb-visor)" />
          <g className="robot-eyes">
            <circle cx="101" cy="34" r="6" fill="url(#rb-eye)" />
            <circle cx="119" cy="34" r="6" fill="url(#rb-eye)" />
          </g>
        </g>

        {/* shoulders + torso */}
        <circle cx="62" cy="96" r="16" fill="url(#rb-metal)" />
        <circle cx="158" cy="96" r="16" fill="url(#rb-metal)" />
        <path d="M66 84 H154 L146 168 Q110 182 74 168 Z" fill="url(#rb-metal)" />
        <path d="M104 86 L110 94 L116 86 Z" fill="#1F2430" />
        <circle cx="110" cy="126" r="22" fill="#FFFFFF" stroke="#C9CED6" strokeWidth="2" />
        <image href="/brand/crest.png" x="94" y="109" width="32" height="34" />

        {/* waist + legs */}
        <rect x="88" y="168" width="44" height="24" rx="8" fill="#2A2F3A" />
        <rect x="84" y="190" width="22" height="62" rx="10" fill="url(#rb-metal)" />
        <rect x="114" y="190" width="22" height="62" rx="10" fill="url(#rb-metal)" />
      </svg>
    </div>
  );
}
