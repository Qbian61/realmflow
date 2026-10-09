import {
  createContext,
  forwardRef,
  useContext,
  useId,
  useLayoutEffect,
  useRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";

type MenuContextValue = {
  id: string;
  close: () => void;
};

const MenuContext = createContext<MenuContextValue | null>(null);
const MENU_ITEM_SELECTOR = [
  '[role="menuitem"]:not(:disabled)',
  '[role="menuitemradio"]:not(:disabled)',
  '[role="menuitemcheckbox"]:not(:disabled)',
  '[role="option"]:not(:disabled)',
].join(",");

function useMenuContext(): MenuContextValue {
  const context = useContext(MenuContext);
  if (!context) throw new Error("Menu components must be rendered inside Menu");
  return context;
}

export type MenuProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  autoFocusItems?: boolean;
  dismissOnOutsidePointer?: boolean;
  trigger?: HTMLElement | null;
};

export function Menu({
  open,
  onOpenChange,
  children,
  autoFocusItems = true,
  dismissOnOutsidePointer = true,
  trigger,
}: MenuProps): JSX.Element | null {
  const id = useId();
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    returnFocusRef.current =
      trigger ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
    const content = document.querySelector<HTMLElement>(
      `[data-ui-menu="${id}"]`,
    );
    if (autoFocusItems) {
      content?.querySelector<HTMLElement>(MENU_ITEM_SELECTOR)?.focus();
    }

    const closeOnEscape = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onOpenChange(false);
    };
    const closeOutside = (event: MouseEvent): void => {
      if (!dismissOnOutsidePointer) return;
      if (
        event.target instanceof Node &&
        (content?.contains(event.target) || trigger?.contains(event.target))
      ) {
        return;
      }
      onOpenChange(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("mousedown", closeOutside);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("mousedown", closeOutside);
      const returnFocus = returnFocusRef.current;
      returnFocus?.focus();
      queueMicrotask(() => returnFocus?.focus());
    };
  }, [
    autoFocusItems,
    dismissOnOutsidePointer,
    id,
    onOpenChange,
    open,
    trigger,
  ]);

  if (!open) return null;

  return (
    <MenuContext.Provider
      value={{ id, close: () => onOpenChange(false) }}
    >
      {children}
    </MenuContext.Provider>
  );
}

export type MenuContentProps = HTMLAttributes<HTMLDivElement> & {
  size?: "compact" | "default";
};

export const MenuContent = forwardRef<HTMLDivElement, MenuContentProps>(
function MenuContent({
  size = "default",
  className,
  onKeyDown,
  ...props
}, ref): JSX.Element {
  const { id } = useMenuContext();

  const moveFocus = (
    event: KeyboardEvent<HTMLDivElement>,
    position: "next" | "previous" | "first" | "last",
  ): void => {
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR),
    );
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLElement);
    const target =
      position === "first"
        ? items[0]
        : position === "last"
          ? items[items.length - 1]
          : position === "next"
            ? items[(Math.max(current, -1) + 1) % items.length]
            : items[(current <= 0 ? items.length : current) - 1];
    event.preventDefault();
    target.focus();
  };

  return (
    <div
      {...props}
      ref={ref}
      data-ui-menu={id}
      className={[
        "ui-menu",
        `ui-menu--${size}`,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      role="menu"
      onKeyDown={(event) => {
        if (event.key === "ArrowDown") moveFocus(event, "next");
        else if (event.key === "ArrowUp") moveFocus(event, "previous");
        else if (event.key === "Home") moveFocus(event, "first");
        else if (event.key === "End") moveFocus(event, "last");
        onKeyDown?.(event);
      }}
    />
  );
});

export type MenuItemProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onSelect"
> & {
  variant?: "default" | "danger";
  onSelect: () => void;
};

export function MenuItem({
  variant = "default",
  onSelect,
  className,
  children,
  onClick,
  ...props
}: MenuItemProps): JSX.Element {
  const { close } = useMenuContext();
  return (
    <button
      {...props}
      type="button"
      role="menuitem"
      className={[
        "ui-menu-item",
        `ui-menu-item--${variant}`,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={(event) => {
        onSelect();
        onClick?.(event);
        close();
      }}
    >
      {children}
    </button>
  );
}

export type MenuRadioItemProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onSelect"
> & {
  checked: boolean;
  onSelect: () => void;
};

export function MenuRadioItem({
  checked,
  onSelect,
  className,
  children,
  onClick,
  ...props
}: MenuRadioItemProps): JSX.Element {
  const { close } = useMenuContext();
  return (
    <button
      {...props}
      type="button"
      role="menuitemradio"
      aria-checked={checked}
      data-checked={checked || undefined}
      className={["ui-menu-item", "ui-menu-radio-item", className]
        .filter(Boolean)
        .join(" ")}
      onClick={(event) => {
        onSelect();
        onClick?.(event);
        close();
      }}
    >
      {children}
    </button>
  );
}

export function MenuSeparator({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>): JSX.Element {
  return (
    <div
      {...props}
      className={["ui-menu-separator", className].filter(Boolean).join(" ")}
      role="separator"
    />
  );
}
