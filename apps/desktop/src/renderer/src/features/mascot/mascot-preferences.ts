import { z } from 'zod';

const mascotPreferencesSchema = z.object({
  x: z.number().finite().min(0).max(10000),
  y: z.number().finite().min(0).max(10000),
  minimized: z.boolean(),
  soundEnabled: z.boolean(),
}).strict();

export type MascotPreferences = z.infer<typeof mascotPreferencesSchema>;
export type MascotPosition = Pick<MascotPreferences, 'x' | 'y'>;

const preferenceKey = 'bcis.mascot.preferences.v2';
const legacyPreferenceKey = 'bcis.mascot.preferences.v1';

export const defaultMascotPreferences: MascotPreferences = {
  x: 0,
  y: 0,
  minimized: false,
  soundEnabled: false,
};

export function loadMascotPreferences(): MascotPreferences {
  try {
    const current = localStorage.getItem(preferenceKey);
    if (current) {
      const parsed = mascotPreferencesSchema.safeParse(JSON.parse(current) as unknown);
      return parsed.success ? parsed.data : defaultMascotPreferences;
    }

    const legacy = localStorage.getItem(legacyPreferenceKey);
    if (!legacy) return defaultMascotPreferences;

    const parsedLegacy = mascotPreferencesSchema.safeParse(JSON.parse(legacy) as unknown);
    if (!parsedLegacy.success) return defaultMascotPreferences;

    saveMascotPreferences(parsedLegacy.data);
    return parsedLegacy.data;
  } catch {
    return defaultMascotPreferences;
  }
}

export function saveMascotPreferences(preferences: MascotPreferences): void {
  try {
    localStorage.setItem(preferenceKey, JSON.stringify(preferences));
  } catch {
    // Local storage can be disabled by a managed desktop profile.
  }
}

export function clampMascotPosition(position: MascotPosition, viewportWidth: number, viewportHeight: number, mascotWidth: number, mascotHeight: number): MascotPosition {
  const margin = 12;
  return {
    x: Math.max(margin, Math.min(position.x, Math.max(margin, viewportWidth - mascotWidth - margin))),
    y: Math.max(margin, Math.min(position.y, Math.max(margin, viewportHeight - mascotHeight - margin))),
  };
}

export function initialMascotPosition(preferences: MascotPreferences, viewportWidth: number, viewportHeight: number): MascotPosition {
  const width = 184;
  const height = 276;
  const position = {
    x: preferences.x > 0 ? preferences.x : viewportWidth - width - 18,
    y: preferences.y > 0 ? preferences.y : viewportHeight - height - 18,
  };
  return clampMascotPosition(position, viewportWidth, viewportHeight, width, height);
}
