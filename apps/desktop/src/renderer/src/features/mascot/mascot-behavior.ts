import type { MascotPreferences } from './mascot-preferences';

export type MascotPersonality = MascotPreferences['personality'];
export type MascotIdleBehavior = 'blink' | 'breathe' | 'look' | 'stretch' | 'wave';

export type MascotBehaviorProfile = {
  blinkIntervalMs: readonly [number, number];
  gestureIntervalMs: readonly [number, number];
  inactivityMs: number;
  gestures: readonly ('breathe' | 'look' | 'stretch' | 'wave')[];
  sleepDialogue: boolean;
};

export const mascotBehaviorProfiles: Record<MascotPersonality, MascotBehaviorProfile> = {
  professional: {
    blinkIntervalMs: [6_500, 9_500],
    gestureIntervalMs: [90_000, 150_000],
    inactivityMs: 300_000,
    gestures: ['breathe', 'look', 'stretch'],
    sleepDialogue: false,
  },
  balanced: {
    blinkIntervalMs: [3_800, 6_500],
    gestureIntervalMs: [55_000, 90_000],
    inactivityMs: 180_000,
    gestures: ['breathe', 'look', 'stretch', 'wave'],
    sleepDialogue: false,
  },
  playful: {
    blinkIntervalMs: [3_000, 5_500],
    gestureIntervalMs: [32_000, 58_000],
    inactivityMs: 60_000,
    gestures: ['breathe', 'look', 'stretch', 'wave', 'wave'],
    sleepDialogue: true,
  },
};

export type MascotBehaviorClock = {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
};

export type MascotBehaviorSchedulerOptions = {
  personality: MascotPersonality;
  clock: MascotBehaviorClock;
  random: () => number;
  canBehave: () => boolean;
  onBehavior: (behavior: MascotIdleBehavior) => void;
  onSleep: () => void;
  onWake: () => void;
};

export type MascotBehaviorScheduler = {
  start(): void;
  stop(): void;
  activity(): void;
};

function randomDelay(range: readonly [number, number], random: () => number): number {
  const sample = Math.max(0, Math.min(0.999_999, random()));
  return Math.round(range[0] + (range[1] - range[0]) * sample);
}

export function createMascotBehaviorScheduler(options: MascotBehaviorSchedulerOptions): MascotBehaviorScheduler {
  const profile = mascotBehaviorProfiles[options.personality];
  let running = false;
  let sleeping = false;
  let blinkTimer: unknown;
  let gestureTimer: unknown;
  let sleepTimer: unknown;
  let behaviorCooldownTimer: unknown;
  let behaviorActive = false;

  const clear = (handle: unknown) => {
    if (handle !== undefined) options.clock.clearTimeout(handle);
  };

  const scheduleBlink = () => {
    if (!running) return;
    blinkTimer = options.clock.setTimeout(() => {
      if (options.canBehave() && !behaviorActive) runBehavior('blink');
      scheduleBlink();
    }, randomDelay(profile.blinkIntervalMs, options.random));
  };

  const scheduleGesture = () => {
    if (!running) return;
    gestureTimer = options.clock.setTimeout(() => {
      if (options.canBehave() && !behaviorActive) {
        const sample = Math.max(0, Math.min(0.999_999, options.random()));
        const index = Math.floor(sample * profile.gestures.length);
        const gesture = profile.gestures[index];
        if (gesture) runBehavior(gesture);
      }
      scheduleGesture();
    }, randomDelay(profile.gestureIntervalMs, options.random));
  };

  const runBehavior = (behavior: MascotIdleBehavior) => {
    behaviorActive = true;
    options.onBehavior(behavior);
    behaviorCooldownTimer = options.clock.setTimeout(() => {
      behaviorActive = false;
      behaviorCooldownTimer = undefined;
    }, behavior === 'blink' ? 180 : behavior === 'breathe' ? 2_400 : 1_250);
  };

  const scheduleSleep = () => {
    if (!running || sleeping) return;
    sleepTimer = options.clock.setTimeout(() => {
      if (!running) return;
      if (options.canBehave()) {
        sleeping = true;
        clear(blinkTimer);
        clear(gestureTimer);
        options.onSleep();
        return;
      }
      scheduleSleep();
    }, profile.inactivityMs);
  };

  const restartIdleTimers = () => {
    clear(blinkTimer);
    clear(gestureTimer);
    clear(sleepTimer);
    clear(behaviorCooldownTimer);
    behaviorCooldownTimer = undefined;
    behaviorActive = false;
    scheduleBlink();
    scheduleGesture();
    scheduleSleep();
  };

  return {
    start() {
      if (running) return;
      running = true;
      restartIdleTimers();
    },
    stop() {
      running = false;
      clear(blinkTimer);
      clear(gestureTimer);
      clear(sleepTimer);
      clear(behaviorCooldownTimer);
      behaviorCooldownTimer = undefined;
      behaviorActive = false;
      blinkTimer = undefined;
      gestureTimer = undefined;
      sleepTimer = undefined;
    },
    activity() {
      if (!running) return;
      if (sleeping) {
        sleeping = false;
        options.onWake();
      }
      restartIdleTimers();
    },
  };
}

export function isSensitiveMascotWorkflowActive(documentRoot: Document): boolean {
  return Boolean(documentRoot.querySelector('.payment-workspace, .collection-batch-detail'))
    || Boolean(documentRoot.activeElement?.matches('input, textarea, select, [contenteditable="true"]'));
}

export function shouldShowPersonalityDialogue(personality: MascotPersonality, event: string): boolean {
  if (event === 'extended-inactivity') return mascotBehaviorProfiles[personality].sleepDialogue;
  if (personality !== 'professional') return true;
  return ['billing-success', 'billing-error', 'payment-posted', 'payment-error', 'gcash-approved', 'backup-success', 'connection-lost', 'connection-restored'].includes(event);
}

export function shouldReactToApplicationEvent(personality: MascotPersonality, event: string): boolean {
  if (personality !== 'professional') return true;
  return ['billing-success', 'billing-error', 'payment-posted', 'payment-error', 'gcash-approved', 'backup-success', 'connection-lost', 'connection-restored'].includes(event);
}
