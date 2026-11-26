import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { IraqMap } from './IraqMap';

// Owner, 26 Nov: "when the dot beats the beat should work like a wave and continue on the whole map".
describe('IraqMap', () => {
  it('draws Iraq as live dots, each timed by its distance from Baghdad, so the beat rolls out as a wave', () => {
    const { container } = render(<IraqMap wrapClass="w" imgClass="m" />);
    const svg = container.querySelector('svg.m') as SVGSVGElement;
    expect(svg).not.toBeNull();
    expect(svg.closest('.iraq-map')).toHaveAttribute('aria-hidden', 'true');
    const dots = [...svg.querySelectorAll('circle.iraq-dot')] as SVGCircleElement[];
    expect(dots.length).toBeGreaterThan(300);
    const delays = dots.map((d) => parseFloat(d.style.getPropertyValue('--wave')));
    expect(delays.every((v) => v >= 0)).toBe(true);
    // the wave starts near Baghdad and reaches the borders last
    const baghdad = svg.querySelector('.baghdad') as SVGCircleElement;
    const bx = Number(baghdad.getAttribute('cx'));
    const by = Number(baghdad.getAttribute('cy'));
    const dist = (d: SVGCircleElement) => Math.hypot(Number(d.getAttribute('cx')) - bx, Number(d.getAttribute('cy')) - by);
    const nearest = dots.reduce((a, b) => (dist(a) < dist(b) ? a : b));
    const farthest = dots.reduce((a, b) => (dist(a) > dist(b) ? a : b));
    expect(parseFloat(nearest.style.getPropertyValue('--wave'))).toBeLessThan(parseFloat(farthest.style.getPropertyValue('--wave')));
  });

  it('Baghdad is a red dot with rings that spread outward', () => {
    const { container } = render(<IraqMap wrapClass="w" imgClass="m" />);
    expect(container.querySelector('.baghdad')).toHaveAttribute('fill', '#e62b1e');
    expect(container.querySelectorAll('.baghdad-ring')).toHaveLength(2);
  });
});
