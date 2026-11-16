import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useIdleLogout } from './useIdleLogout';

const MIN = 60_000;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useIdleLogout', () => {
  it('signs out after 15 idle minutes', () => {
    const onTimeout = vi.fn();
    renderHook(() => useIdleLogout(15, onTimeout));
    act(() => vi.advanceTimersByTime(14 * MIN));
    expect(onTimeout).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1.5 * MIN));
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('activity resets timer', () => {
    const onTimeout = vi.fn();
    renderHook(() => useIdleLogout(15, onTimeout));
    act(() => vi.advanceTimersByTime(10 * MIN));
    act(() => {
      window.dispatchEvent(new Event('pointerdown'));
    });
    act(() => vi.advanceTimersByTime(10 * MIN));
    expect(onTimeout).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(6 * MIN));
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('signs out on visibility change after expiry', () => {
    const onTimeout = vi.fn();
    renderHook(() => useIdleLogout(30, onTimeout));
    // Simulate a sleeping tablet: the clock jumps without timers firing.
    vi.setSystemTime(Date.now() + 31 * MIN);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('does nothing when disabled (minutes = 0)', () => {
    const onTimeout = vi.fn();
    renderHook(() => useIdleLogout(0, onTimeout));
    act(() => vi.advanceTimersByTime(120 * MIN));
    expect(onTimeout).not.toHaveBeenCalled();
  });
});
