export type DisplayMode = "fixed" | "auto";

export type DisplayPreferences = {
  mode: DisplayMode;
};

export const DISPLAY_PREFERENCES_KEY = "nemonori:pokemon-marble:display:v1";
export const DEFAULT_DISPLAY_PREFERENCES: Readonly<DisplayPreferences> = {
  mode: "fixed",
};

export function normalizeDisplayPreferences(value: unknown): DisplayPreferences {
  const saved =
    value && typeof value === "object"
      ? (value as Partial<DisplayPreferences>)
      : {};
  return { mode: saved.mode === "auto" ? "auto" : "fixed" };
}

/** Display preferences are local to this device, outside the game save. */
export function loadDisplayPreferences(
  storage?: Pick<Storage, "getItem">,
): DisplayPreferences {
  try {
    const saved = (storage ?? globalThis.localStorage)?.getItem(
      DISPLAY_PREFERENCES_KEY,
    );
    return normalizeDisplayPreferences(saved ? JSON.parse(saved) : null);
  } catch {
    return { ...DEFAULT_DISPLAY_PREFERENCES };
  }
}

export function saveDisplayPreferences(
  preferences: DisplayPreferences,
  storage?: Pick<Storage, "setItem">,
): void {
  try {
    (storage ?? globalThis.localStorage)?.setItem(
      DISPLAY_PREFERENCES_KEY,
      JSON.stringify(normalizeDisplayPreferences(preferences)),
    );
  } catch {
    // A full or unavailable storage area must not interrupt play.
  }
}
