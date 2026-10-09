import { act, renderHook } from "@testing-library/react";
import {
  readTerminalDisplayPreferences,
  useTerminalDisplayPreferences,
} from "../../workbench/terminal-display-preferences";

describe("terminal display preferences", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("falls back to the dark 12px default for missing or damaged data", () => {
    expect(readTerminalDisplayPreferences()).toEqual({
      version: 1,
      colorScheme: "dark",
      fontSize: 12,
    });

    window.localStorage.setItem(
      "realmflow:terminal-display-preferences:v1",
      "{damaged",
    );
    expect(readTerminalDisplayPreferences()).toEqual({
      version: 1,
      colorScheme: "dark",
      fontSize: 12,
    });
  });

  it("clamps font size and synchronizes all mounted consumers", () => {
    const first = renderHook(() => useTerminalDisplayPreferences());
    const second = renderHook(() => useTerminalDisplayPreferences());

    act(() => {
      first.result.current.update({
        colorScheme: "light",
        fontSize: 99,
      });
    });

    expect(first.result.current.preferences).toMatchObject({
      colorScheme: "light",
      fontSize: 20,
    });
    expect(second.result.current.preferences).toMatchObject({
      colorScheme: "light",
      fontSize: 20,
    });

    act(() => first.result.current.update({ fontSize: 1 }));
    expect(second.result.current.preferences.fontSize).toBe(10);
  });
});
