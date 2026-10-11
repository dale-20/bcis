import { describe, expect, it } from 'vitest';
import { IDLE_ANIMATION, transitionAnimation, type MascotAnimationState } from './mascot-animation';

describe('mascot animation state machine', () => {
  it('starts from idle and accepts an animation with its configured duration', () => {
    const next = transitionAnimation(IDLE_ANIMATION, { type: 'play', request: { name: 'success' }, requestId: 1 });
    expect(next).toEqual({ name: 'success', priority: 5, requestId: 1, durationMs: 2_800 });
  });

  it('rejects lower-priority requests without changing the active state', () => {
    const warning = transitionAnimation(IDLE_ANIMATION, { type: 'play', request: { name: 'warning' }, requestId: 1 });
    expect(transitionAnimation(warning, { type: 'play', request: { name: 'success' }, requestId: 2 })).toBe(warning);
  });

  it('allows equal and higher priorities to interrupt the current animation', () => {
    const warning = transitionAnimation(IDLE_ANIMATION, { type: 'play', request: { name: 'warning' }, requestId: 1 });
    expect(transitionAnimation(warning, { type: 'play', request: { name: 'warning' }, requestId: 2 }).requestId).toBe(2);
    expect(transitionAnimation(warning, { type: 'play', request: { name: 'surprised' }, requestId: 3 }).name).toBe('surprised');
  });

  it('ignores stale completion callbacks and returns a finished reaction to idle', () => {
    const error = transitionAnimation(IDLE_ANIMATION, { type: 'play', request: { name: 'error', durationMs: 500 }, requestId: 4 });
    expect(transitionAnimation(error, { type: 'complete', requestId: 3 })).toBe(error);
    expect(transitionAnimation(error, { type: 'complete', requestId: 4 })).toEqual({ ...IDLE_ANIMATION, requestId: 4 });
  });

  it('resets looping states and invalidates their request identity', () => {
    const processing = transitionAnimation(IDLE_ANIMATION, { type: 'play', request: { name: 'processing', durationMs: null }, requestId: 9 });
    const reset = transitionAnimation(processing as MascotAnimationState, { type: 'reset', requestId: 10 });
    expect(reset).toEqual({ ...IDLE_ANIMATION, requestId: 10 });
  });
});
