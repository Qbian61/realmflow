import {
  createContext,
  forwardRef,
  useContext,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export type PopoverPlacement =
  "bottom-start" | "bottom-end" | "top-start" | "top-end";

type PopoverContextValue = {
  id: string;
  position: CSSProperties;
};

const PopoverContext = createContext<PopoverContextValue | null>(null);

export type PopoverProps = {
  open: boolean;
  children: ReactNode;
  onOpenChange: (open: boolean) => void;
  trigger?: HTMLElement | null;
  placement?: PopoverPlacement;
  dismissOnOutsidePointer?: boolean;
};

export function Popover({
  open,
  children,
  onOpenChange,
  trigger,
  placement = "bottom-start",
  dismissOnOutsidePointer = true,
}: PopoverProps): JSX.Element | null {
  const id = useId();
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [position, setPosition] = useState<CSSProperties>({
    visibility: "hidden",
  });

  useLayoutEffect(() => {
    if (!open) return;
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : (trigger ?? null);
    const content = document.querySelector<HTMLElement>(
      `[data-ui-popover="${id}"]`,
    );
    const updatePosition = (): void => {
      if (!content) return;
      if (!trigger) {
        setPosition({
          top: 12,
          left: 12,
          maxHeight: Math.max(120, window.innerHeight - 24),
          visibility: "visible",
        });
        return;
      }
      const triggerRect = trigger.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();
      const gap = 6;
      const viewportGap = 12;
      const opensAbove = placement.startsWith("top");
      const alignsEnd = placement.endsWith("end");
      const preferredTop = opensAbove
        ? triggerRect.top - contentRect.height - gap
        : triggerRect.bottom + gap;
      const fallbackTop = opensAbove
        ? triggerRect.bottom + gap
        : triggerRect.top - contentRect.height - gap;
      const top =
        preferredTop >= viewportGap &&
        preferredTop + contentRect.height <= window.innerHeight - viewportGap
          ? preferredTop
          : fallbackTop;
      const preferredLeft = alignsEnd
        ? triggerRect.right - contentRect.width
        : triggerRect.left;
      const left = Math.min(
        Math.max(viewportGap, preferredLeft),
        Math.max(
          viewportGap,
          window.innerWidth - contentRect.width - viewportGap,
        ),
      );
      setPosition({
        top: Math.max(viewportGap, top),
        left,
        maxHeight: Math.max(
          120,
          window.innerHeight - Math.max(viewportGap, top) - viewportGap,
        ),
        visibility: "visible",
      });
    };
    updatePosition();
    content?.querySelector<HTMLElement>("[data-autofocus]")?.focus();

    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onOpenChange(false);
    };
    const closeOutside = (event: PointerEvent): void => {
      if (
        !dismissOnOutsidePointer ||
        !(event.target instanceof Node) ||
        content?.contains(event.target) ||
        trigger?.contains(event.target)
      ) {
        return;
      }
      onOpenChange(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOutside);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      returnFocusRef.current?.focus();
    };
  }, [dismissOnOutsidePointer, id, onOpenChange, open, placement, trigger]);

  const context = useMemo(() => ({ id, position }), [id, position]);
  if (!open) return null;

  return createPortal(
    <PopoverContext.Provider value={context}>
      {children}
    </PopoverContext.Provider>,
    document.body,
  );
}

export const PopoverContent = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(function PopoverContent({ className, style, ...props }, ref): JSX.Element {
  const context = useContext(PopoverContext);
  if (!context) throw new Error("PopoverContent must be rendered in Popover");
  return (
    <div
      {...props}
      ref={ref}
      data-ui-popover={context.id}
      role={props.role ?? "dialog"}
      className={["ui-popover", className].filter(Boolean).join(" ")}
      style={{ ...context.position, ...style }}
    />
  );
});
