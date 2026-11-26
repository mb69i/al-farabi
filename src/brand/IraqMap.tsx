import { BAGHDAD } from './baghdadOnMap';

type Props = { wrapClass: string; imgClass: string };

/**
 * The white halftone map of Iraq from the TEDxBaghdad 2026 artwork, with Baghdad as a red dot that beats like a
 * heart and sends two rings outward (owner, 26 Nov). Decorative: hidden from screen readers. The beat stops under
 * reduced motion (base.css).
 */
export function IraqMap({ wrapClass, imgClass }: Props) {
  return (
    <span className={`iraq-map ${wrapClass}`} aria-hidden="true">
      <img className={imgClass} src="/brand/iraq-dots.svg" alt="" />
      <span
        className="baghdad"
        style={{ left: `${BAGHDAD.x}%`, top: `${BAGHDAD.y}%`, width: `${BAGHDAD.size}%` }}
      >
        <span className="baghdad-ring" />
        <span className="baghdad-ring baghdad-ring--late" />
      </span>
    </span>
  );
}
