// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  createMascotBehaviorScheduler,
  isSensitiveMascotWorkflowActive,
  mascotBehaviorProfiles,
  shouldReactToApplicationEvent,
  shouldShowPersonalityDialogue,
  type MascotBehaviorClock,
} from './mascot-behavior';

class FakeClock implements MascotBehaviorClock {
  now = 0;
  private nextId = 0;
  private readonly timers = new Map<number, { due: number; callback: () => void }>();

  setTimeout(callback: () => void, delayMs: number): number {
    const id = ++this.nextId;
    this.timers.set(id, { due: this.now + delayMs, callback });
    return id;
  }

  clearTimeout(handle: unknown): void {
    if (typeof handle === 'number') this.timers.delete(handle);
  }

  advanceBy(durationMs: number): void {
    const end = this.now + durationMs;
    while (true) {
      const next = [...this.timers.entries()].sort((left, right) => left[1].due - right[1].due)[0];
      if (!next || next[1].due > end) break;
      this.now = next[1].due;
      this.timers.delete(next[0]);
      next[1].callback();
    }
    this.now = end;
  }

  get pendingCount(): number { return this.timers.size; }
}

describe('mascot natural behavior', () => {
  it('uses quieter professional timing and more expressive playful timing', () => {
    expect(mascotBehaviorProfiles.professional.blinkIntervalMs[0]).toBeGreaterThan(mascotBehaviorProfiles.playful.blinkIntervalMs[0]);
    expect(mascotBehaviorProfiles.professional.gestureIntervalMs[0]).toBeGreaterThan(mascotBehaviorProfiles.playful.gestureIntervalMs[0]);
    expect(mascotBehaviorProfiles.professional.gestures).not.toContain('wave');
    expect(mascotBehaviorProfiles.playful.gestures).toContain('wave');
  });

  it('keeps randomized blink delays within the selected personality bounds', () => {
    const clock = new FakeClock();
    const behaviors: string[] = [];
    const scheduler = createMascotBehaviorScheduler({ personality: 'balanced', clock, random: () => 0.5, canBehave: () => true, onBehavior: (behavior) => behaviors.push(behavior), onSleep: () => undefined, onWake: () => undefined });
    scheduler.start();
    clock.advanceBy(5_149);
    expect(behaviors).toEqual([]);
    clock.advanceBy(1);
    expect(behaviors).toEqual(['blink']);
    scheduler.stop();
  });

  it('enters sleep once after inactivity and wakes only when activity resumes', () => {
    const clock = new FakeClock();
    const sleeps: number[] = [];
    const wakes: number[] = [];
    const scheduler = createMascotBehaviorScheduler({ personality: 'playful', clock, random: () => 0.5, canBehave: () => true, onBehavior: () => undefined, onSleep: () => sleeps.push(clock.now), onWake: () => wakes.push(clock.now) });
    scheduler.start();
    clock.advanceBy(mascotBehaviorProfiles.playful.inactivityMs);
    clock.advanceBy(mascotBehaviorProfiles.playful.inactivityMs * 2);
    expect(sleeps).toEqual([mascotBehaviorProfiles.playful.inactivityMs]);
    scheduler.activity();
    scheduler.activity();
    expect(wakes).toHaveLength(1);
    clock.advanceBy(mascotBehaviorProfiles.playful.inactivityMs);
    expect(sleeps).toHaveLength(2);
    scheduler.stop();
  });

  it('keeps natural gestures scheduled during ordinary activity without going to sleep', () => {
    const clock = new FakeClock();
    const behaviors: string[] = [];
    let sleeps = 0;
    const scheduler = createMascotBehaviorScheduler({ personality: 'playful', clock, random: () => 0, canBehave: () => true, onBehavior: (behavior) => behaviors.push(behavior), onSleep: () => { sleeps += 1; }, onWake: () => undefined });
    scheduler.start();
    for (let second = 0; second < 70; second += 1) {
      clock.advanceBy(1_000);
      scheduler.activity();
    }
    expect(behaviors).toContain('blink');
    expect(behaviors).toContain('breathe');
    expect(sleeps).toBe(0);
    scheduler.stop();
    expect(clock.pendingCount).toBe(0);
  });

  it('rate-limits ambient poses so one idle gesture cannot overlap another', () => {
    const clock = new FakeClock();
    const behaviors: string[] = [];
    // A source returning zero picks the shortest timer delay and first available gesture.
    const scheduler = createMascotBehaviorScheduler({ personality: 'playful', clock, random: () => 0, canBehave: () => true, onBehavior: (behavior) => behaviors.push(behavior), onSleep: () => undefined, onWake: () => undefined });
    scheduler.start();
    clock.advanceBy(3_000);
    expect(behaviors).toEqual(['blink']);
    scheduler.stop();
    expect(clock.pendingCount).toBe(0);
  });

  it('does not animate or sleep while behavior is suppressed, including reduced-motion mode', () => {
    const clock = new FakeClock();
    const behaviors: string[] = [];
    let sleeps = 0;
    const scheduler = createMascotBehaviorScheduler({ personality: 'balanced', clock, random: () => 0, canBehave: () => false, onBehavior: (behavior) => behaviors.push(behavior), onSleep: () => { sleeps += 1; }, onWake: () => undefined });
    scheduler.start();
    clock.advanceBy(200_000);
    expect(behaviors).toEqual([]);
    expect(sleeps).toBe(0);
    scheduler.stop();
    expect(clock.pendingCount).toBe(0);
  });

  it('suppresses unnecessary dialogue for professional mode and sleep chatter outside playful mode', () => {
    expect(shouldShowPersonalityDialogue('professional', 'payment-posted')).toBe(true);
    expect(shouldShowPersonalityDialogue('professional', 'subscriber-created')).toBe(false);
    expect(shouldShowPersonalityDialogue('balanced', 'extended-inactivity')).toBe(false);
    expect(shouldShowPersonalityDialogue('playful', 'extended-inactivity')).toBe(true);
    expect(shouldReactToApplicationEvent('professional', 'subscriber-created')).toBe(false);
    expect(shouldReactToApplicationEvent('professional', 'payment-posted')).toBe(true);
    expect(shouldReactToApplicationEvent('balanced', 'subscriber-created')).toBe(true);
  });

  it('treats payment entry, reconciliation, and focused form controls as sensitive', () => {
    document.body.innerHTML = '<main><div class="payment-workspace"></div></main>';
    expect(isSensitiveMascotWorkflowActive(document)).toBe(true);
    document.body.innerHTML = '<main><div class="collection-batch-detail"></div></main>';
    expect(isSensitiveMascotWorkflowActive(document)).toBe(true);
    document.body.innerHTML = '<main><input /></main>';
    document.querySelector('input')?.focus();
    expect(isSensitiveMascotWorkflowActive(document)).toBe(true);
  });
});
