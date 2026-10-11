// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { clampMascotPosition, defaultMascotPreferences, initialMascotPosition, loadMascotPreferences, mascotDimensions, saveMascotPreferences } from './mascot-preferences';

afterEach(() => localStorage.clear());

describe('mascot preferences', () => {
  it.each(['v1', 'v2'])('migrates validated %s display settings to the current version', (version) => {
    localStorage.setItem(`bcis.mascot.preferences.${version}`, JSON.stringify({ x: 90, y: 120, minimized: true, soundEnabled: false }));

    expect(loadMascotPreferences()).toEqual({ ...defaultMascotPreferences, x: 90, y: 120, minimized: true });
    expect(localStorage.getItem('bcis.mascot.preferences.v3')).toBe(JSON.stringify({ ...defaultMascotPreferences, x: 90, y: 120, minimized: true }));
  });

  it('falls back safely for invalid, corrupt, or unavailable values', () => {
    localStorage.setItem('bcis.mascot.preferences.v3', '{broken');
    expect(loadMascotPreferences()).toEqual(defaultMascotPreferences);

    localStorage.setItem('bcis.mascot.preferences.v3', JSON.stringify({ ...defaultMascotPreferences, x: -1 }));
    expect(loadMascotPreferences()).toEqual(defaultMascotPreferences);
  });

  it('clamps restored and dragged positions inside the active viewport', () => {
    expect(initialMascotPosition({ ...defaultMascotPreferences, x: 9000, y: 9000 }, 960, 640)).toEqual({ x: 832, y: 450 });
    expect(clampMascotPosition({ x: -500, y: 8000 }, 960, 640, 184, 276)).toEqual({ x: 752, y: 352 });
  });

  it('keeps Buddy in the reserved right lane and clear of the top app bar', () => {
    expect(clampMascotPosition({ x: 0, y: 0 }, 1366, 768, 116, 178)).toEqual({ x: 1196, y: 76 });
    expect(clampMascotPosition({ x: 0, y: 0 }, 1366, 768, 216, 322)).toEqual({ x: 1126, y: 76 });
  });

  it('uses compact-by-default sizing and retains configurable size dimensions', () => {
    expect(defaultMascotPreferences.size).toBe('small');
    expect(mascotDimensions('medium')).toEqual({ width: 184, height: 276 });
    expect(mascotDimensions('large').width).toBeGreaterThan(mascotDimensions('small').width);
  });

  it('persists the requested settings and starts muted', () => {
    const preferences = { ...defaultMascotPreferences, x: 22, y: 44, animationsEnabled: false, personality: 'professional' as const, size: 'large' as const };
    saveMascotPreferences(preferences);
    expect(JSON.parse(localStorage.getItem('bcis.mascot.preferences.v3') ?? '{}')).toEqual(preferences);
    expect(loadMascotPreferences()).toEqual(preferences);
    expect(defaultMascotPreferences.soundEnabled).toBe(false);
  });
});
