// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useMascotAnimation } from './use-mascot-animation';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('useMascotAnimation', () => {
  it('returns temporary reactions to idle and calls completion once', () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    const { result } = renderHook(() => useMascotAnimation());
    act(() => { result.current.play({ name: 'error', durationMs: 800 }, onComplete); });
    act(() => { vi.advanceTimersByTime(799); });
    expect(result.current.state.name).toBe('error');
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.state.name).toBe('idle');
    expect(onComplete).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(2_000); });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('pauses reaction duration while the app document is hidden', () => {
    vi.useFakeTimers();
    let hidden = false;
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => hidden ? 'hidden' : 'visible' });
    const onComplete = vi.fn();
    const { result } = renderHook(() => useMascotAnimation());
    act(() => { result.current.play({ name: 'warning', durationMs: 1_000 }, onComplete); });
    act(() => { vi.advanceTimersByTime(400); });
    act(() => { hidden = true; document.dispatchEvent(new Event('visibilitychange')); });
    expect(result.current.paused).toBe(true);
    act(() => { vi.advanceTimersByTime(5_000); });
    expect(result.current.state.name).toBe('warning');
    expect(onComplete).not.toHaveBeenCalled();
    act(() => { hidden = false; document.dispatchEvent(new Event('visibilitychange')); });
    expect(result.current.paused).toBe(false);
    act(() => { vi.advanceTimersByTime(599); });
    expect(result.current.state.name).toBe('warning');
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.state.name).toBe('idle');
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('clears timers and completion handlers on interruption and unmount', () => {
    vi.useFakeTimers();
    const firstCompletion = vi.fn();
    const secondCompletion = vi.fn();
    const { result, unmount } = renderHook(() => useMascotAnimation());
    act(() => { result.current.play({ name: 'happy', durationMs: 2_000 }, firstCompletion); });
    act(() => { result.current.play({ name: 'success', durationMs: 2_000 }, secondCompletion); });
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(firstCompletion).not.toHaveBeenCalled();
    expect(secondCompletion).not.toHaveBeenCalled();
  });

  it('exposes an explicit completion callback for a looping animation', () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useMascotAnimation());
    act(() => { result.current.play({ name: 'processing', durationMs: null }, onComplete); });
    act(() => { result.current.complete(result.current.state.requestId); });
    expect(result.current.state.name).toBe('idle');
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
