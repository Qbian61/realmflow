import {
  createContext,
  useContext,
  useId,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";

type TabsVariant = "page" | "segmented";
type ActivationMode = "manual" | "automatic";

type TabsContextValue = {
  id: string;
  value: string;
  variant: TabsVariant;
  activationMode: ActivationMode;
  onValueChange: (value: string) => void;
};

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext(): TabsContextValue {
  const context = useContext(TabsContext);
  if (!context) throw new Error("Tabs components must be rendered inside Tabs");
  return context;
}

function valueId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

export type TabsProps = {
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
  variant?: TabsVariant;
  activationMode?: ActivationMode;
  className?: string;
};

export function Tabs({
  value,
  onValueChange,
  children,
  variant = "page",
  activationMode = "manual",
  className,
}: TabsProps): JSX.Element {
  const id = useId();
  return (
    <TabsContext.Provider
      value={{ id, value, variant, activationMode, onValueChange }}
    >
      <div
        className={[
          "ui-tabs",
          `ui-tabs--${variant}`,
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {children}
      </div>
    </TabsContext.Provider>
  );
}

export function TabList({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>): JSX.Element {
  const { variant } = useTabsContext();
  return (
    <div
      {...props}
      className={[
        "ui-tab-list",
        `ui-tab-list--${variant}`,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      role="tablist"
    />
  );
}

export type TabProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "value"
> & {
  value: string;
};

export function Tab({
  value,
  id,
  "aria-controls": ariaControls,
  className,
  disabled,
  onClick,
  onKeyDown,
  ...props
}: TabProps): JSX.Element {
  const context = useTabsContext();
  const selected = context.value === value;
  const suffix = valueId(value);
  const tabId = id ?? `${context.id}-tab-${suffix}`;
  const panelId = ariaControls ?? `${context.id}-panel-${suffix}`;
  const activate = (): void => context.onValueChange(value);

  const moveFocus = (
    event: KeyboardEvent<HTMLButtonElement>,
    position: "next" | "previous" | "first" | "last",
  ): void => {
    const list = event.currentTarget.closest('[role="tablist"]');
    const tabs = Array.from(
      list?.querySelectorAll<HTMLButtonElement>(
        '[role="tab"]:not(:disabled)',
      ) ?? [],
    );
    const current = tabs.indexOf(event.currentTarget);
    if (current < 0 || tabs.length === 0) return;
    const target =
      position === "first"
        ? tabs[0]
        : position === "last"
          ? tabs[tabs.length - 1]
          : position === "next"
            ? tabs[(current + 1) % tabs.length]
            : tabs[(current - 1 + tabs.length) % tabs.length];
    event.preventDefault();
    target.focus();
    if (context.activationMode === "automatic") {
      target.click();
    }
  };

  return (
    <button
      {...props}
      id={tabId}
      className={["ui-tab", className].filter(Boolean).join(" ")}
      type="button"
      role="tab"
      aria-controls={panelId}
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      disabled={disabled}
      onClick={(event) => {
        activate();
        onClick?.(event);
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") moveFocus(event, "next");
        else if (event.key === "ArrowLeft") moveFocus(event, "previous");
        else if (event.key === "Home") moveFocus(event, "first");
        else if (event.key === "End") moveFocus(event, "last");
        else if (
          context.activationMode === "manual" &&
          (event.key === "Enter" || event.key === " ")
        ) {
          event.preventDefault();
          activate();
        }
        onKeyDown?.(event);
      }}
    />
  );
}

export type TabPanelProps = HTMLAttributes<HTMLDivElement> & {
  value: string;
};

export function TabPanel({
  value,
  id,
  "aria-labelledby": ariaLabelledBy,
  className,
  ...props
}: TabPanelProps): JSX.Element {
  const context = useTabsContext();
  const suffix = valueId(value);
  const panelId = id ?? `${context.id}-panel-${suffix}`;
  const tabId = ariaLabelledBy ?? `${context.id}-tab-${suffix}`;
  return (
    <div
      {...props}
      id={panelId}
      className={["ui-tab-panel", className].filter(Boolean).join(" ")}
      role="tabpanel"
      aria-labelledby={tabId}
      hidden={context.value !== value}
    />
  );
}
