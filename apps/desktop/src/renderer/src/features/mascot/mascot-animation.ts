export const MASCOT_ANIMATIONS = [
  'idle', 'walk', 'happy', 'thinking', 'processing', 'success', 'warning', 'error', 'sleep', 'surprised', 'greeting',
] as const;

export type MascotAnimationName = typeof MASCOT_ANIMATIONS[number];

export type MascotAnimationState = {
  name: MascotAnimationName;
  priority: number;
  requestId: number;
  durationMs: number | null;
};

export type MascotAnimationRequest = {
  name: MascotAnimationName;
  priority?: number;
  durationMs?: number | null;
};

export const animationMood = {
  idle: 'neutral', walk: 'walking', happy: 'happy', thinking: 'thinking', processing: 'processing',
  success: 'celebrating', warning: 'concerned', error: 'concerned', sleep: 'sleepy', surprised: 'surprised', greeting: 'hello',
} as const;

export const IDLE_ANIMATION: MascotAnimationState = { name: 'idle', priority: 0, requestId: 0, durationMs: null };

export const animationPriority: Record<MascotAnimationName, number> = {
  idle: 0,
  walk: 1,
  happy: 3,
  thinking: 2,
  processing: 2,
  success: 5,
  warning: 6,
  error: 7,
  sleep: 0,
  surprised: 7,
  greeting: 3,
};

export const animationDuration: Record<MascotAnimationName, number | null> = {
  idle: null,
  walk: null,
  happy: 3_200,
  thinking: 6_000,
  processing: null,
  success: 2_800,
  warning: 5_000,
  error: 1_800,
  sleep: null,
  surprised: 1_500,
  greeting: 3_800,
};

export type AnimationTransition =
  | { type: 'play'; request: MascotAnimationRequest; requestId: number }
  | { type: 'complete'; requestId: number }
  | { type: 'reset'; requestId: number };

export function transitionAnimation(current: MascotAnimationState, transition: AnimationTransition): MascotAnimationState {
  if (transition.type === 'reset') return { ...IDLE_ANIMATION, requestId: transition.requestId };
  if (transition.type === 'complete') {
    if (transition.requestId !== current.requestId) return current;
    return { ...IDLE_ANIMATION, requestId: transition.requestId };
  }

  const { request, requestId } = transition;
  const priority = request.name === 'idle' ? 0 : request.priority ?? animationPriority[request.name];
  if (request.name !== 'idle' && current.name !== 'idle' && priority < current.priority) return current;
  return {
    name: request.name,
    priority,
    requestId,
    durationMs: request.durationMs === undefined ? animationDuration[request.name] : request.durationMs,
  };
}
