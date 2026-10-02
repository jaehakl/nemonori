export type AudioPreferences = {
  muted: boolean;
  musicVolume: number;
  effectsVolume: number;
};

export const AUDIO_PREFERENCES_KEY = "nemonori:pokemon-marble:audio:v1";
export const DEFAULT_AUDIO_PREFERENCES: Readonly<AudioPreferences> = {
  muted: false,
  musicVolume: 0.3,
  effectsVolume: 0.6,
};

function volume(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : fallback;
}

export function normalizeAudioPreferences(value: unknown): AudioPreferences {
  const saved =
    value && typeof value === "object"
      ? (value as Partial<AudioPreferences>)
      : {};
  return {
    muted: typeof saved.muted === "boolean" ? saved.muted : false,
    musicVolume: volume(
      saved.musicVolume,
      DEFAULT_AUDIO_PREFERENCES.musicVolume,
    ),
    effectsVolume: volume(
      saved.effectsVolume,
      DEFAULT_AUDIO_PREFERENCES.effectsVolume,
    ),
  };
}

/** Audio settings intentionally live outside the versioned game save. */
export function loadAudioPreferences(
  storage?: Pick<Storage, "getItem">,
): AudioPreferences {
  try {
    const source = storage ?? globalThis.localStorage;
    const saved = source?.getItem(AUDIO_PREFERENCES_KEY);
    return normalizeAudioPreferences(saved ? JSON.parse(saved) : null);
  } catch {
    return { ...DEFAULT_AUDIO_PREFERENCES };
  }
}

export function saveAudioPreferences(
  preferences: AudioPreferences,
  storage?: Pick<Storage, "setItem">,
): void {
  try {
    const destination = storage ?? globalThis.localStorage;
    destination?.setItem(
      AUDIO_PREFERENCES_KEY,
      JSON.stringify(normalizeAudioPreferences(preferences)),
    );
  } catch {
    // Private browsing and storage limits must never interrupt a turn.
  }
}
