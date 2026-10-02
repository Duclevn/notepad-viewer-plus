import { describe, expect, it } from "vitest";
import { resolveEffectiveTheme, shouldRefreshForSystemTheme } from "../src/ui/theme";

describe("theme resolution", () => {
  it("keeps explicit themes and resolves system from the OS preference", () => {
    expect(resolveEffectiveTheme("light", true)).toBe("light");
    expect(resolveEffectiveTheme("dark", false)).toBe("dark");
    expect(resolveEffectiveTheme("system", true)).toBe("dark");
    expect(resolveEffectiveTheme("system", false)).toBe("light");
  });

  it("refreshes only when a system preference change alters the effective theme", () => {
    expect(shouldRefreshForSystemTheme("system", "light", "dark")).toBe(true);
    expect(shouldRefreshForSystemTheme("system", "dark", "dark")).toBe(false);
    expect(shouldRefreshForSystemTheme("dark", "dark", "light")).toBe(false);
  });
});
