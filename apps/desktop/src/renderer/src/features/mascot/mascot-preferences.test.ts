// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { clampMascotPosition, defaultMascotPreferences, initialMascotPosition, loadMascotPreferences, saveMascotPreferences } from './mascot-preferences';

afterEach(() => localStorage.clear());

describe('mascot preferences', () => {
  it('migrates validated v1 display settings to the current version', () => {
    localStorage.setItem('bcis.mascot.preferences.v1', JSON.stringify({ x: 90, y: 120, minimized: true, soundEnabled: false }));

    expect(loadMascotPreferences()).toEqual({ x: 90, y: 120, minimized: true, soundEnabled: false });
    expect(localStorage.getItem('bcis.mascot.preferences.v2')).toBe(JSON.stringify({ x: 90, y: 120, minimized: true, soundEnabled: false }));
  });

  it('falls back safely for invalid, corrupt, or unavailable values', () => {
    localStorage.setItem('bcis.mascot.preferences.v2', '{broken');
    expect(loadMascotPreferences()).toEqual(defaultMascotPreferences);

    localStorage.setItem('bcis.mascot.preferences.v2', JSON.stringify({ x: -1, y: 0, minimized: false, soundEnabled: true }));
    expect(loadMascotPreferences()).toEqual(defaultMascotPreferences);
  });

  it('clamps restored and dragged positions inside the active viewport', () => {
    expect(initialMascotPosition({ ...defaultMascotPreferences, x: 9000, y: 9000 }, 960, 640)).toEqual({ x: 764, y: 352 });
    expect(clampMascotPosition({ x: -500, y: 8000 }, 960, 640, 184, 276)).toEqual({ x: 12, y: 352 });
  });

  it('keeps settings muted by default and persists only display preferences', () => {
    saveMascotPreferences({ x: 22, y: 44, minimized: false, soundEnabled: false });
    expect(JSON.parse(localStorage.getItem('bcis.mascot.preferences.v2') ?? '{}')).toEqual({ x: 22, y: 44, minimized: false, soundEnabled: false });
  });
});
