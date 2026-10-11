import { z } from 'zod';

export const mascotSizeSchema = z.enum(['small', 'medium', 'large']);
export const mascotPersonalitySchema = z.enum(['professional', 'balanced', 'playful']);

const mascotPreferencesSchema = z.object({
  x: z.number().finite().min(0).max(10000),
  y: z.number().finite().min(0).max(10000),
  minimized: z.boolean(),
  enabled: z.boolean(),
  animationsEnabled: z.boolean(),
  soundEnabled: z.boolean(),
  size: mascotSizeSchema,
  personality: mascotPersonalitySchema,
}).strict();

export type MascotPreferences = z.infer<typeof mascotPreferencesSchema>;
export type MascotPosition = Pick<MascotPreferences, 'x' | 'y'>;

const preferenceKey = 'bcis.mascot.preferences.v3';
const legacyPreferenceKeys = ['bcis.mascot.preferences.v2', 'bcis.mascot.preferences.v1'] as const;

export const defaultMascotPreferences: MascotPreferences = {
  x: 0,
  y: 0,
  minimized: false,
  enabled: true,
  animationsEnabled: true,
  soundEnabled: false,
  size: 'small',
  personality: 'balanced',
};

function parsePreferences(value: unknown): MascotPreferences | null {
  const parsed = mascotPreferencesSchema.safeParse(value);
  if (parsed.success) return parsed.data;

  // Older versions persisted position, minimized state, and sound only.
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const legacy = value as Record<string, unknown>;
  const compatible = {
    ...defaultMascotPreferences,
    x: legacy.x,
    y: legacy.y,
    minimized: legacy.minimized,
    soundEnabled: legacy.soundEnabled,
  };
  const migrated = mascotPreferencesSchema.safeParse(compatible);
  return migrated.success ? migrated.data : null;
}

export function loadMascotPreferences(): MascotPreferences {
  try {
    const current = localStorage.getItem(preferenceKey);
    if (current) return parsePreferences(JSON.parse(current) as unknown) ?? defaultMascotPreferences;

    for (const key of legacyPreferenceKeys) {
      const legacy = localStorage.getItem(key);
      if (!legacy) continue;
      const preferences = parsePreferences(JSON.parse(legacy) as unknown);
      if (!preferences) continue;
      saveMascotPreferences(preferences);
      return preferences;
    }
    return defaultMascotPreferences;
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

export function mascotDimensions(size: MascotPreferences['size']): { width: number; height: number } {
  switch (size) {
    case 'small': return { width: 116, height: 178 };
    case 'medium': return { width: 184, height: 276 };
    case 'large': return { width: 216, height: 322 };
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
  const { width, height } = mascotDimensions(preferences.size);
  const position = {
    x: preferences.x > 0 ? preferences.x : viewportWidth - width - 18,
    y: preferences.y > 0 ? preferences.y : viewportHeight - height - 18,
  };
  return clampMascotPosition(position, viewportWidth, viewportHeight, width, height);
}
