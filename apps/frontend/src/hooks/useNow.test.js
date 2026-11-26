import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNow } from './useNow';

describe('useNow', () => {
  afterEach(() => vi.useRealTimers());

  it('ticks on its interval', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useNow(1000));
    const first = result.current;
    act(() => { vi.advanceTimersByTime(3000); });
    expect(result.current).toBeGreaterThan(first);
  });

  it('stands still when told there is nothing to tick', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useNow(0));
    const first = result.current;
    act(() => { vi.advanceTimersByTime(60000); });
    expect(result.current).toBe(first);
  });
});
