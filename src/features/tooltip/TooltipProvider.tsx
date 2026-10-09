import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

type TooltipProviderProps = {
  children: ReactNode;
  delayMs?: number;
};

type ActiveTarget = {
  element: HTMLElement;
  text: string;
  previousDescribedBy: string | null;
  hovered: boolean;
  focused: boolean;
  revealed: boolean;
};

type VisibleTooltip = {
  element: HTMLElement;
  text: string;
};

type TooltipPosition = {
  top: number;
  left: number;
  arrowLeft: number;
  placement: "top" | "bottom";
  visible: boolean;
};

const TOOLTIP_GAP = 8;
const VIEWPORT_PADDING = 8;
const FALLBACK_HEIGHT = 28;
const FALLBACK_WIDTH = 80;

export function TooltipProvider({
  children,
  delayMs = 320,
}: TooltipProviderProps): JSX.Element {
  const tooltipId = `global-tooltip-${useId().replaceAll(":", "")}`;
  const activeRef = useRef<ActiveTarget>();
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<VisibleTooltip>();
  const [position, setPosition] = useState<TooltipPosition>({
    top: 0,
    left: 0,
    arrowLeft: 0,
    placement: "top",
    visible: false,
  });

  const clearTimer = useCallback((): void => {
    if (timerRef.current === undefined) return;
    clearTimeout(timerRef.current);
    timerRef.current = undefined;
  }, []);

  const restoreActiveTarget = useCallback((): void => {
    clearTimer();
    const active = activeRef.current;
    if (!active) return;

    if (active.element.isConnected && !active.element.hasAttribute("title")) {
      active.element.setAttribute("title", active.text);
    }
    if (active.previousDescribedBy) {
      active.element.setAttribute(
        "aria-describedby",
        active.previousDescribedBy,
      );
    } else {
      active.element.removeAttribute("aria-describedby");
    }
    activeRef.current = undefined;
    setTooltip(undefined);
  }, [clearTimer]);

  const dismissActiveTooltip = useCallback((): void => {
    clearTimer();
    const active = activeRef.current;
    if (!active) return;
    if (active.previousDescribedBy) {
      active.element.setAttribute(
        "aria-describedby",
        active.previousDescribedBy,
      );
    } else {
      active.element.removeAttribute("aria-describedby");
    }
    active.revealed = true;
    setTooltip(undefined);
  }, [clearTimer]);

  const reveal = useCallback(
    (active: ActiveTarget): void => {
      if (activeRef.current !== active || !active.element.isConnected) return;
      active.element.setAttribute(
        "aria-describedby",
        active.previousDescribedBy
          ? `${active.previousDescribedBy} ${tooltipId}`
          : tooltipId,
      );
      active.revealed = true;
      setPosition((current) => ({ ...current, visible: false }));
      setTooltip({ element: active.element, text: active.text });
    },
    [tooltipId],
  );

  const activate = useCallback(
    (
      element: HTMLElement,
      interaction: "hovered" | "focused",
    ): void => {
      let active = activeRef.current;
      if (active?.element !== element) {
        restoreActiveTarget();
        const text = element.getAttribute("title")?.trim();
        if (!text) return;
        active = {
          element,
          text,
          previousDescribedBy: element.getAttribute("aria-describedby"),
          hovered: false,
          focused: false,
          revealed: false,
        };
        element.removeAttribute("title");
        activeRef.current = active;
      }

      active[interaction] = true;
      if (interaction === "focused") {
        clearTimer();
        reveal(active);
      } else if (!active.revealed && timerRef.current === undefined) {
        timerRef.current = setTimeout(() => {
          timerRef.current = undefined;
          reveal(active);
        }, delayMs);
      }
    },
    [clearTimer, delayMs, restoreActiveTarget, reveal],
  );

  const deactivate = useCallback(
    (
      element: HTMLElement,
      interaction: "hovered" | "focused",
      relatedTarget: EventTarget | null,
    ): void => {
      const active = activeRef.current;
      if (!active || active.element !== element) return;
      if (
        relatedTarget instanceof Node &&
        active.element.contains(relatedTarget)
      ) {
        return;
      }
      active[interaction] = false;
      if (!active.hovered && !active.focused) restoreActiveTarget();
    },
    [restoreActiveTarget],
  );

  useEffect(() => {
    const titledElement = (target: EventTarget | null): HTMLElement | null => {
      if (!(target instanceof Element)) return null;
      const active = activeRef.current?.element;
      if (active?.contains(target)) return active;
      return target.closest("[title]") as HTMLElement | null;
    };

    const onPointerOver = (event: PointerEvent): void => {
      const element = titledElement(event.target);
      if (element) activate(element, "hovered");
    };
    const onPointerOut = (event: PointerEvent): void => {
      const element =
        activeRef.current?.element ??
        (event.target instanceof Element
          ? (event.target.closest("[title]") as HTMLElement | null)
          : null);
      if (element) deactivate(element, "hovered", event.relatedTarget);
    };
    const onFocusIn = (event: FocusEvent): void => {
      const element = titledElement(event.target);
      if (element) activate(element, "focused");
    };
    const onFocusOut = (event: FocusEvent): void => {
      const element =
        activeRef.current?.element ??
        (event.target instanceof Element
          ? (event.target.closest("[title]") as HTMLElement | null)
          : null);
      if (element) deactivate(element, "focused", event.relatedTarget);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") restoreActiveTarget();
    };

    document.addEventListener("pointerover", onPointerOver);
    document.addEventListener("pointerout", onPointerOut);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", dismissActiveTooltip);
    return () => {
      document.removeEventListener("pointerover", onPointerOver);
      document.removeEventListener("pointerout", onPointerOut);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", dismissActiveTooltip);
      restoreActiveTarget();
    };
  }, [
    activate,
    deactivate,
    dismissActiveTooltip,
    restoreActiveTarget,
  ]);

  useLayoutEffect(() => {
    if (!tooltip) return;

    const updatePosition = (): void => {
      const bubble = tooltipRef.current;
      if (!bubble || !tooltip.element.isConnected) {
        restoreActiveTarget();
        return;
      }
      const anchor = tooltip.element.getBoundingClientRect();
      const bubbleBounds = bubble.getBoundingClientRect();
      const width = bubbleBounds.width || FALLBACK_WIDTH;
      const height = bubbleBounds.height || FALLBACK_HEIGHT;
      const anchorCenter = anchor.left + anchor.width / 2;
      const placement =
        anchor.top - TOOLTIP_GAP - height >= VIEWPORT_PADDING
          ? "top"
          : "bottom";
      const maxLeft = Math.max(
        VIEWPORT_PADDING,
        window.innerWidth - width - VIEWPORT_PADDING,
      );
      const left = Math.min(
        Math.max(VIEWPORT_PADDING, anchorCenter - width / 2),
        maxLeft,
      );
      const arrowLeft = Math.min(
        Math.max(10, anchorCenter - left),
        width - 10,
      );
      setPosition({
        top:
          placement === "top"
            ? anchor.top - TOOLTIP_GAP - height
            : anchor.bottom + TOOLTIP_GAP,
        left,
        arrowLeft,
        placement,
        visible: true,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [restoreActiveTarget, tooltip]);

  return (
    <>
      {children}
      {tooltip
        ? createPortal(
            <div
              ref={tooltipRef}
              id={tooltipId}
              className="global-tooltip"
              role="tooltip"
              data-placement={position.placement}
              style={
                {
                  top: position.top,
                  left: position.left,
                  visibility: position.visible ? "visible" : "hidden",
                } satisfies CSSProperties
              }
            >
              <span>{tooltip.text}</span>
              <span
                className="global-tooltip-arrow"
                aria-hidden="true"
                style={{ left: position.arrowLeft }}
              />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
