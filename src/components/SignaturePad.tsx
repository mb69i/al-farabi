import SignaturePadLib from 'signature_pad';
import { useEffect, useRef } from 'react';

type Props = {
  /** Called after each stroke: stroke count, PNG getter, raw stroke data getter. */
  onChange: (strokes: number, png: () => Promise<Blob>, data: () => unknown) => void;
  clearLabel: string;
  hint: string;
};

/** Handwritten signature on a canvas, sharp on high-DPI tablets. */
export function SignaturePad({ onChange, clearLabel, hint }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const pad = useRef<SignaturePadLib | null>(null);
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const p = new SignaturePadLib(el, { penColor: '#0C1733', minWidth: 1, maxWidth: 3, backgroundColor: 'rgba(0,0,0,0)' });
    pad.current = p;

    const report = () =>
      cb.current(
        p.toData().length,
        () => new Promise<Blob>((resolve) => el.toBlob((b) => resolve(b ?? new Blob()), 'image/png')),
        () => p.toData(),
      );

    const resize = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const data = p.toData();
      el.width = el.offsetWidth * ratio;
      el.height = el.offsetHeight * ratio;
      el.getContext('2d')?.scale(ratio, ratio);
      p.fromData(data);
    };
    resize();
    p.addEventListener('endStroke', report);
    window.addEventListener('resize', resize);
    return () => {
      p.removeEventListener('endStroke', report);
      window.removeEventListener('resize', resize);
      p.off();
    };
  }, []);

  function clear() {
    pad.current?.clear();
    cb.current(0, async () => new Blob(), () => []);
  }

  return (
    <div className="sigpad">
      <canvas ref={canvas} className="sigpad-canvas" aria-label={hint} />
      <span className="sigpad-hint" aria-hidden="true">
        {hint}
      </span>
      <button type="button" className="sigpad-clear" onClick={clear}>
        {clearLabel}
      </button>
    </div>
  );
}
