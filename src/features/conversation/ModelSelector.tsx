import { Check, ChevronDown, Settings2, WandSparkles } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { ProviderLogo } from "../settings/ProviderLogo";
import { useWorkspacePageActive } from "../navigation/WorkspaceRouteCache";

export type ModelSelectorGroup = {
  providerId: string;
  providerName: string;
  models: Array<{
    value: string;
    label: string;
    reasoningSupported?: boolean;
  }>;
};

type ModelSelectorProps = {
  ariaLabel: string;
  autoLabel: string;
  configureLabel: string;
  emptyLabel: string;
  searchPlaceholder: string;
  groups: ModelSelectorGroup[];
  value: string;
  effectiveValue?: string;
  disabled?: boolean;
  onOpen?: () => void;
  onChange: (value: string) => void;
  onConfigure?: () => void;
};

export function ModelSelector({
  ariaLabel,
  autoLabel,
  configureLabel,
  groups,
  value,
  effectiveValue,
  disabled = false,
  onOpen,
  onChange,
  onConfigure,
}: ModelSelectorProps): JSX.Element {
  const pageActive = useWorkspacePageActive();
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<"up" | "down">("up");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const modelItems = useMemo(() => {
    const providers = new Map<string, ModelSelectorGroup>();
    for (const group of groups) {
      const existing = providers.get(group.providerId);
      if (existing) {
        existing.models.push(...group.models);
      } else {
        providers.set(group.providerId, {
          ...group,
          models: [...group.models],
        });
      }
    }
    return [...providers.values()].flatMap((group) =>
      group.models.map((model) => ({
        ...model,
        providerId: group.providerId,
        providerName: group.providerName,
      })),
    );
  }, [groups]);
  const displayedValue = value
    ? modelItems.find(
        (model) => model.value === value || model.value === effectiveValue,
      )
    : undefined;

  useEffect(() => {
    if (!pageActive) return;
    const close = (event: MouseEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [pageActive]);

  useLayoutEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLButtonElement>('[role="option"]:not(:disabled)')
      ?.focus();
  }, [open]);

  const toggle = (): void => {
    if (disabled) return;
    setOpen((current) => {
      const next = !current;
      if (next) {
        const bounds = rootRef.current?.getBoundingClientRect();
        if (bounds) {
          const spaceAbove = bounds.top - 8;
          const spaceBelow = window.innerHeight - bounds.bottom - 8;
          setPlacement(
            spaceAbove >= 320 || spaceAbove >= spaceBelow ? "up" : "down",
          );
        }
        onOpen?.();
      }
      return next;
    });
  };

  const choose = (nextValue: string): void => {
    onChange(nextValue);
    setOpen(false);
  };
  const moveOptionFocus = (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ): void => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const options = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        '[role="option"]:not(:disabled)',
      ),
    );
    if (options.length === 0) return;
    const current = options.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    const target =
      event.key === "Home"
        ? options[0]
        : event.key === "End"
          ? options[options.length - 1]
          : event.key === "ArrowDown"
            ? options[(Math.max(current, -1) + 1) % options.length]
            : options[(current <= 0 ? options.length : current) - 1];
    event.preventDefault();
    target?.focus();
  };

  return (
    <div className="model-selector" ref={rootRef}>
      <button
        ref={triggerRef}
        className="model-selector-trigger"
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        title={ariaLabel}
        aria-expanded={open}
        aria-controls="model-selector-listbox"
        disabled={disabled}
        onClick={toggle}
      >
        <span>{displayedValue?.label ?? autoLabel}</span>
        <ChevronDown size={14} />
      </button>
      {open ? (
        <div
          className="model-selector-popover ui-menu"
          data-placement={placement}
        >
          <div
            ref={listRef}
            className="model-selector-list"
            id="model-selector-listbox"
            role="listbox"
            aria-label={ariaLabel}
            onKeyDown={moveOptionFocus}
          >
            <button
              className="ui-menu-item"
              type="button"
              role="option"
              aria-selected={!value}
              onClick={() => choose("")}
            >
              <span className="model-selector-option-content">
                <WandSparkles
                  className="model-selector-provider-logo"
                  size={14}
                />
                <span className="model-selector-option-label">{autoLabel}</span>
              </span>
              {!value ? <Check size={13} /> : null}
            </button>
            {modelItems.map((model) => {
              const selected = model.value === value;
              return (
                <button
                  className="ui-menu-item"
                  type="button"
                  role="option"
                  aria-selected={selected}
                  key={model.value}
                  onClick={() => choose(model.value)}
                >
                  <span className="model-selector-option-content">
                    <ProviderLogo
                      className="model-selector-provider-logo"
                      id={model.providerId}
                      name={model.providerName}
                      size={14}
                    />
                    <span className="model-selector-option-label">
                      {model.label}
                    </span>
                  </span>
                  {selected ? <Check size={13} /> : null}
                </button>
              );
            })}
          </div>
          <button
            className="model-selector-configure ui-menu-item"
            type="button"
            onClick={() => {
              setOpen(false);
              onConfigure?.();
            }}
          >
            <Settings2 size={14} />
            <span>{configureLabel}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
