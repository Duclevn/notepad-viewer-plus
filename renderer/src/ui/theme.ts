import type { Theme } from "../bridge/protocol";
import type { EffectiveTheme } from "../viewers/types";

const DARK_MODE_QUERY = "(prefers-color-scheme: dark)";

export function resolveEffectiveTheme(theme: Theme, systemPrefersDark?: boolean): EffectiveTheme {
  if (theme === "light" || theme === "dark") return theme;
  const prefersDark = systemPrefersDark ?? (typeof window.matchMedia === "function" && window.matchMedia(DARK_MODE_QUERY).matches);
  return prefersDark ? "dark" : "light";
}

export function shouldRefreshForSystemTheme(
  configuredTheme: Theme,
  currentTheme: EffectiveTheme | undefined,
  nextTheme: EffectiveTheme
): boolean {
  return configuredTheme === "system" && currentTheme !== nextTheme;
}

export function systemThemeQuery(): MediaQueryList | undefined {
  return typeof window.matchMedia === "function" ? window.matchMedia(DARK_MODE_QUERY) : undefined;
}
