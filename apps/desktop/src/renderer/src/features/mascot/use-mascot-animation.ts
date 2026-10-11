import { useCallback, useEffect, useRef, useState } from 'react';
import { IDLE_ANIMATION, transitionAnimation, type MascotAnimationRequest, type MascotAnimationState } from './mascot-animation';

type AnimationCompletion = (state: MascotAnimationState) => void;

export function useMascotAnimation() {
  const [state, setState] = useState<MascotAnimationState>(IDLE_ANIMATION);
  const [paused, setPaused] = useState(() => typeof document !== 'undefined' && document.visibilityState === 'hidden');
  const pausedRef = useRef(paused);
  const stateRef = useRef(state);
  const nextId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deadline = useRef<number | null>(null);
  const remaining = useRef<number | null>(null);
  const completion = useRef<AnimationCompletion | undefined>(undefined);

  const commit = useCallback((next: MascotAnimationState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const clearTimer = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    deadline.current = null;
  }, []);

  const finish = useCallback((requestId: number) => {
    const finished = stateRef.current;
    if (finished.requestId !== requestId || finished.name === 'idle') return;
    clearTimer();
    remaining.current = null;
    const onComplete = completion.current;
    completion.current = undefined;
    commit(transitionAnimation(finished, { type: 'complete', requestId }));
    onComplete?.(finished);
  }, [clearTimer, commit]);

  const schedule = useCallback((requestId: number, durationMs: number) => {
    clearTimer();
    remaining.current = durationMs;
    deadline.current = Date.now() + durationMs;
    timer.current = setTimeout(() => finish(requestId), durationMs);
  }, [clearTimer, finish]);

  const play = useCallback((request: MascotAnimationRequest, onComplete?: AnimationCompletion): boolean => {
    const requestId = ++nextId.current;
    const next = transitionAnimation(stateRef.current, { type: 'play', request, requestId });
    if (next.requestId !== requestId) return false;
    clearTimer();
    remaining.current = null;
    completion.current = onComplete;
    commit(next);
    if (next.durationMs !== null) {
      remaining.current = next.durationMs;
      if (!pausedRef.current) schedule(requestId, next.durationMs);
    }
    return true;
  }, [clearTimer, commit, schedule]);

  const reset = useCallback(() => {
    clearTimer();
    remaining.current = null;
    completion.current = undefined;
    commit(transitionAnimation(stateRef.current, { type: 'reset', requestId: ++nextId.current }));
  }, [clearTimer, commit]);

  useEffect(() => {
    const onVisibilityChange = () => {
      const isHidden = document.visibilityState === 'hidden';
      if (pausedRef.current === isHidden) return;
      pausedRef.current = isHidden;
      setPaused(isHidden);
      if (isHidden) {
        if (timer.current !== null && deadline.current !== null) {
          remaining.current = Math.max(0, deadline.current - Date.now());
          clearTimer();
        }
        return;
      }
      const active = stateRef.current;
      const waitMs = remaining.current;
      if (active.durationMs !== null && waitMs !== null) schedule(active.requestId, waitMs);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [clearTimer, schedule]);

  useEffect(() => () => {
    clearTimer();
    completion.current = undefined;
  }, [clearTimer]);

  return { state, paused, play, reset, complete: finish };
}
