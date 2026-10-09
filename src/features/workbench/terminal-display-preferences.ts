import { useEffect, useState } from "react";

export type TerminalDisplayPreferences = {
  version: 1;
  colorScheme: "light" | "dark";
  fontSize: number;
};

const STORAGE_KEY = "realmflow:terminal-display-preferences:v1";
const CHANGE_EVENT = "realmflow:terminal-display-preferences-change";
const MIN_FONT_SIZE = 10;
const MAX_FONT_SIZE = 20;
const DEFAULT_PREFERENCES: TerminalDisplayPreferences = {
  version: 1,
  colorScheme: "dark",
  fontSize: 12,
};

function normalizeTerminalDisplayPreferences(
  value: unknown,
): TerminalDisplayPreferences {
  if (!value || typeof value !== "object") return DEFAULT_PREFERENCES;
  const candidate = value as Record<string, unknown>;
  const colorScheme =
    candidate.colorScheme === "light" || candidate.colorScheme === "dark"
      ? candidate.colorScheme
      : DEFAULT_PREFERENCES.colorScheme;
  const rawFontSize =
    typeof candidate.fontSize === "number" && Number.isFinite(candidate.fontSize)
      ? candidate.fontSize
      : DEFAULT_PREFERENCES.fontSize;
  return {
    version: 1,
    colorScheme,
    fontSize: Math.min(
      MAX_FONT_SIZE,
      Math.max(MIN_FONT_SIZE, Math.round(rawFontSize)),
    ),
  };
}

export function readTerminalDisplayPreferences(): TerminalDisplayPreferences {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored
      ? normalizeTerminalDisplayPreferences(JSON.parse(stored))
      : DEFAULT_PREFERENCES;
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function useTerminalDisplayPreferences(): {
  preferences: TerminalDisplayPreferences;
  update: (patch: Partial<TerminalDisplayPreferences>) => void;
} {
  const [preferences, setPreferences] = useState(
    readTerminalDisplayPreferences,
  );

  useEffect(() => {
    const synchronize = (event: Event): void => {
      setPreferences(
        normalizeTerminalDisplayPreferences(
          (event as CustomEvent<unknown>).detail,
        ),
      );
    };
    window.addEventListener(CHANGE_EVENT, synchronize);
    return () => window.removeEventListener(CHANGE_EVENT, synchronize);
  }, []);

  const update = (patch: Partial<TerminalDisplayPreferences>): void => {
    const next = normalizeTerminalDisplayPreferences({
      ...preferences,
      ...patch,
      version: 1,
    });
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: next }));
  };

  return { preferences, update };
}
