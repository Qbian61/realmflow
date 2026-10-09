import { render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import * as UI from "./index";

describe("motion primitives", () => {
  it("renders a shared decorative spinner with a stable size", () => {
    expect(UI).toHaveProperty("Spinner");
    if (!("Spinner" in UI)) return;

    const Spinner = UI.Spinner as ComponentType<{ size?: number }>;
    const view = render(<Spinner size={18} />);

    const spinner = view.container.querySelector(".ui-spinner");
    expect(spinner).toHaveClass("ui-spinner");
    expect(spinner).toHaveAttribute("aria-hidden", "true");
    expect(spinner).toHaveAttribute("width", "18");
    expect(spinner).toHaveAttribute("height", "18");
  });

  it.each([
    [false, "smooth"],
    [true, "auto"],
  ] as const)(
    "uses %s reduced-motion preference to choose %s scrolling",
    (reduced, expected) => {
      expect(UI).toHaveProperty("getProgrammaticScrollBehavior");
      if (!("getProgrammaticScrollBehavior" in UI)) return;

      const getProgrammaticScrollBehavior =
        UI.getProgrammaticScrollBehavior as (
          matchMedia?: (query: string) => Pick<MediaQueryList, "matches">,
        ) => ScrollBehavior;
      const matchMedia = vi.fn(() => ({ matches: reduced }));

      expect(getProgrammaticScrollBehavior(matchMedia)).toBe(expected);
      expect(matchMedia).toHaveBeenCalledWith(
        "(prefers-reduced-motion: reduce)",
      );
    },
  );

  it("falls back to smooth scrolling when matchMedia is unavailable", () => {
    expect(UI).toHaveProperty("getProgrammaticScrollBehavior");
    if (!("getProgrammaticScrollBehavior" in UI)) return;

    const getProgrammaticScrollBehavior =
      UI.getProgrammaticScrollBehavior as (
        matchMedia?: undefined,
      ) => ScrollBehavior;

    expect(getProgrammaticScrollBehavior(undefined)).toBe("smooth");
  });
});
