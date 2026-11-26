import { useId, type CSSProperties } from 'react';
import { MAP_BAGHDAD, MAP_DOTS, MAP_VIEWBOX } from './iraqDots';

type Props = { wrapClass: string; imgClass: string };

/** Seconds the wave takes to travel from Baghdad to the farthest border. */
const WAVE_SECONDS = 1.1;

const FARTHEST = Math.max(...MAP_DOTS.map(([x, y]) => Math.hypot(x - MAP_BAGHDAD.x, y - MAP_BAGHDAD.y)));
// each dot's delay: the beat leaves Baghdad on the "dub" (0.3 s) and reaches the borders WAVE_SECONDS later
const DOTS = MAP_DOTS.map(([x, y, r]) => ({
  x,
  y,
  r,
  wave: 0.3 + (Math.hypot(x - MAP_BAGHDAD.x, y - MAP_BAGHDAD.y) / FARTHEST) * WAVE_SECONDS,
}));

/**
 * The white halftone map of Iraq from the TEDxBaghdad 2026 artwork, drawn live (owner, 26 Nov): Baghdad is a red
 * dot that beats like a heart, and every beat rolls across the whole country as a wave — each dot swells and
 * glows as it passes, timed by its distance from Baghdad. Decorative, so hidden from screen readers; everything
 * holds still under reduced motion (base.css).
 */
export function IraqMap({ wrapClass, imgClass }: Props) {
  // the wave front: a broad red ring that grows from Baghdad past the farthest dot, seen only through the dots
  // (owner, 26 Nov: "the wave should continue to the edge of the map")
  const maskId = `iraq-dots-${useId().replace(/:/g, '')}`;
  return (
    <span className={`iraq-map ${wrapClass}`} aria-hidden="true">
      <svg className={imgClass} viewBox={MAP_VIEWBOX} focusable="false">
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse">
            <g fill="#ffffff">
              {DOTS.map((d) => (
                <circle key={`${d.x},${d.y}`} cx={d.x} cy={d.y} r={d.r * 1.15} />
              ))}
            </g>
          </mask>
        </defs>
        <g fill="#ffffff">
          {DOTS.map((d) => (
            <circle
              key={`${d.x},${d.y}`}
              className="iraq-dot"
              cx={d.x}
              cy={d.y}
              r={d.r}
              style={{ '--wave': `${d.wave.toFixed(2)}s` } as CSSProperties}
            />
          ))}
        </g>
        <g mask={`url(#${maskId})`}>
          <circle className="wave-front" cx={MAP_BAGHDAD.x} cy={MAP_BAGHDAD.y} r={FARTHEST + 40} />
        </g>
        <circle className="baghdad-ring" cx={MAP_BAGHDAD.x} cy={MAP_BAGHDAD.y} r={MAP_BAGHDAD.r} />
        <circle className="baghdad-ring baghdad-ring--late" cx={MAP_BAGHDAD.x} cy={MAP_BAGHDAD.y} r={MAP_BAGHDAD.r} />
        <circle className="baghdad" cx={MAP_BAGHDAD.x} cy={MAP_BAGHDAD.y} r={MAP_BAGHDAD.r} fill="#e62b1e" />
      </svg>
    </span>
  );
}
