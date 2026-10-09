import {
  forwardRef,
  useLayoutEffect,
  useRef,
  type HTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

const FOCUSABLE_SELECTOR = [
  "button:not(:disabled)",
  "input:not(:disabled)",
  "select:not(:disabled)",
  "textarea:not(:disabled)",
  "a[href]",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export type DialogSize = "compact" | "default" | "wide" | "workspace";

export type DialogProps = {
  open: boolean;
  children: ReactNode;
  onOpenChange: (open: boolean) => void;
  size?: DialogSize;
  closeOnBackdrop?: boolean;
  locked?: boolean;
  className?: string;
  backdropClassName?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
};

export function Dialog({
  open,
  children,
  onOpenChange,
  size = "default",
  closeOnBackdrop = true,
  locked = false,
  className,
  backdropClassName,
  ...ariaProps
}: DialogProps): JSX.Element | null {
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const dialog = dialogRef.current;
    const initialFocus =
      dialog?.querySelector<HTMLElement>("[data-autofocus]") ??
      dialog?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ??
      dialog;
    initialFocus?.focus();

    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || locked) return;
      if (document.querySelector("[data-ui-menu]")) return;
      event.preventDefault();
      event.stopPropagation();
      onOpenChange(false);
    };
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
      returnFocusRef.current?.focus();
    };
  }, [locked, onOpenChange, open]);

  if (!open) return null;

  const trapFocus = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [],
    );
    if (focusable.length === 0) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div
      className={["ui-dialog-backdrop", backdropClassName]
        .filter(Boolean)
        .join(" ")}
      data-testid="ui-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (
          event.target === event.currentTarget &&
          closeOnBackdrop &&
          !locked
        ) {
          onOpenChange(false);
        }
      }}
    >
      <div
        {...ariaProps}
        ref={dialogRef}
        className={[
          "ui-dialog",
          `ui-dialog--${size}`,
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        onKeyDown={trapFocus}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

export const DialogHeader = forwardRef<
  HTMLElement,
  HTMLAttributes<HTMLElement>
>(function DialogHeader({ className, ...props }, ref): JSX.Element {
  return (
    <header
      {...props}
      ref={ref}
      className={["ui-dialog__header", className].filter(Boolean).join(" ")}
    />
  );
});

export const DialogBody = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function DialogBody({ className, ...props }, ref): JSX.Element {
    return (
      <div
        {...props}
        ref={ref}
        data-dialog-scroll="true"
        className={["ui-dialog__body", className].filter(Boolean).join(" ")}
      />
    );
  },
);

export const DialogFooter = forwardRef<
  HTMLElement,
  HTMLAttributes<HTMLElement>
>(function DialogFooter({ className, ...props }, ref): JSX.Element {
  return (
    <footer
      {...props}
      ref={ref}
      className={["ui-dialog__footer", className].filter(Boolean).join(" ")}
    />
  );
});
