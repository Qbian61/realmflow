import { Check, ChevronDown } from "lucide-react";
import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";

type OptionData = {
  value: string;
  label: ReactNode;
  text: string;
  disabled: boolean;
  title?: string;
  group?: string;
};

export type SelectProps = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "children" | "defaultValue" | "size"
> & {
  children: ReactNode;
  defaultValue?: string | readonly string[];
};

function textFromNode(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) return node.map(textFromNode).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return textFromNode(node.props.children);
  }
  return "";
}

function optionValue(
  child: ReactElement<{ value?: string | number; children?: ReactNode }>,
): string {
  if (child.props.value !== undefined) return String(child.props.value);
  return textFromNode(child.props.children);
}

function optionDataFromChildren(children: ReactNode, groupDisabled = false, group?: string): OptionData[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement(child)) return [];
    if (child.type === Fragment || child.type === "optgroup") {
      return optionDataFromChildren(
        (child as ReactElement<{ children?: ReactNode }>).props.children,
        groupDisabled ||
          Boolean((child as ReactElement<{ disabled?: boolean }>).props.disabled),
        child.type === "optgroup"
          ? (child as ReactElement<{ label?: string }>).props.label
          : group,
      );
    }
    if (child.type !== "option") return [];
    const option = child as ReactElement<{
      children?: ReactNode;
      disabled?: boolean;
      title?: string;
      value?: string | number;
    }>;
    const text = textFromNode(option.props.children);
    return [
      {
        value: optionValue(option),
        label: option.props.children,
        text,
        disabled: groupDisabled || Boolean(option.props.disabled),
        title: option.props.title,
        group,
      },
    ];
  });
}

function selectedOptionValues(
  value: SelectProps["value"],
  defaultValue: SelectProps["defaultValue"],
  multiple: boolean | undefined,
): string[] {
  const selected = value ?? defaultValue ?? (multiple ? [] : "");
  if (Array.isArray(selected)) return selected.map(String);
  return selected === undefined ? [] : [String(selected)];
}

export function Select({
  children,
  className,
  defaultValue,
  disabled = false,
  id,
  multiple,
  name,
  onBlur,
  onChange,
  required,
  value,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  "aria-label": ariaLabel,
  autoComplete,
  autoFocus,
  title,
}: SelectProps): JSX.Element {
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [uncontrolledValue, setUncontrolledValue] = useState<
    string | readonly string[]
  >(defaultValue ?? (multiple ? [] : ""));
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const options = useMemo(() => optionDataFromChildren(children), [children]);
  const selectedValues = selectedOptionValues(
    value ?? uncontrolledValue,
    defaultValue,
    multiple,
  );
  const selectedValueSet = new Set(selectedValues);
  const selectedOptions = options.filter((option) =>
    selectedValueSet.has(option.value),
  );
  const selectedLabel = multiple
    ? selectedOptions.length > 0
      ? selectedOptions.map((option) => option.text).join(", ")
      : "-"
    : (selectedOptions[0]?.label ?? options[0]?.label ?? "");
  const selectedText = multiple
    ? selectedOptions.length > 0
      ? selectedOptions.map((option) => option.text).join(", ")
      : "-"
    : (selectedOptions[0]?.text ?? options[0]?.text ?? "");

  useLayoutEffect(() => {
    if (ariaLabel || !triggerRef.current) return;
    const label = triggerRef.current.closest("label");
    if (!label) return;
    const labelClone = label.cloneNode(true) as HTMLElement;
    labelClone.querySelectorAll(".ui-select").forEach((node) => node.remove());
    const inferredLabel = labelClone.textContent?.trim();
    if (inferredLabel) {
      triggerRef.current.setAttribute("aria-label", inferredLabel);
    }
  }, [ariaLabel]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const selectedOption = listRef.current?.querySelector<HTMLButtonElement>(
      "[role='option'][aria-selected='true']:not(:disabled)",
    );
    const firstOption = listRef.current?.querySelector<HTMLButtonElement>(
      "[role='option']:not(:disabled)",
    );
    (selectedOption ?? firstOption)?.focus();
  }, [open]);

  const emitChange = (nextValues: string[]): void => {
    if (value === undefined) {
      setUncontrolledValue(multiple ? nextValues : (nextValues[0] ?? ""));
    }
    const selectedOptionObjects = options
      .filter((option) => nextValues.includes(option.value))
      .map((option) => ({ value: option.value }));
    const target = {
      value: nextValues[0] ?? "",
      selectedOptions: selectedOptionObjects,
    };
    onChange?.({
      target,
      currentTarget: target,
    } as unknown as ChangeEvent<HTMLSelectElement>);
  };

  const choose = (option: OptionData): void => {
    if (option.disabled || disabled) return;
    if (multiple) {
      const next = selectedValueSet.has(option.value)
        ? selectedValues.filter((current) => current !== option.value)
        : [...selectedValues, option.value];
      emitChange(next);
      return;
    }
    emitChange([option.value]);
    setOpen(false);
  };

  const moveOptionFocus = (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ): void => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const focusableOptions = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        "[role='option']:not(:disabled)",
      ),
    );
    if (focusableOptions.length === 0) return;
    const current = focusableOptions.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    const target =
      event.key === "Home"
        ? focusableOptions[0]
        : event.key === "End"
          ? focusableOptions[focusableOptions.length - 1]
          : event.key === "ArrowDown"
            ? focusableOptions[(Math.max(current, -1) + 1) % focusableOptions.length]
            : focusableOptions[
                (current <= 0 ? focusableOptions.length : current) - 1
              ];
    event.preventDefault();
    target?.focus();
  };

  const closeOnBlur = (event: FocusEvent<HTMLDivElement>): void => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setOpen(false);
    onBlur?.(event as unknown as FocusEvent<HTMLSelectElement>);
  };

  return (
    <div
      className={["model-selector", "ui-select", className]
        .filter(Boolean)
        .join(" ")}
      data-disabled={disabled || undefined}
      data-multiple={multiple || undefined}
      data-open={open || undefined}
      ref={rootRef}
      onBlur={closeOnBlur}
    >
      {name && multiple
        ? selectedValues.map((selectedValue) => (
            <input
              aria-label={name}
              autoComplete="off"
              key={selectedValue}
              name={name}
              readOnly
              type="hidden"
              value={selectedValue}
            />
          ))
        : null}
      <span
        className="model-selector-trigger ui-select-trigger ui-select-display"
        aria-hidden="true"
      >
        <span>{selectedLabel}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </span>
      <input
        className="model-selector-trigger ui-select-trigger ui-select-input"
        disabled={disabled}
        id={id}
        name={multiple ? undefined : name}
        ref={triggerRef}
        role="combobox"
        readOnly
        required={multiple ? undefined : required}
        value={selectedValues[0] ?? ""}
        aria-describedby={ariaDescribedBy}
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-invalid={ariaInvalid}
        aria-label={ariaLabel}
        aria-valuetext={selectedText}
        autoComplete={autoComplete ?? "off"}
        autoFocus={autoFocus}
        title={title}
        onClick={() => {
          if (!disabled) setOpen((current) => !current);
        }}
        onKeyDown={(event) => {
          if (disabled) return;
          if (!["ArrowDown", "Enter", " "].includes(event.key)) return;
          event.preventDefault();
          setOpen(true);
        }}
        onChange={(event) => {
          const nextValue = event.currentTarget.value;
          if (multiple) {
            emitChange(nextValue ? [nextValue] : []);
          } else {
            emitChange([nextValue]);
          }
        }}
      />
      {open ? (
        <div className="model-selector-popover ui-select-popover ui-menu">
          <div
            className="model-selector-list ui-select-list"
            id={listboxId}
            ref={listRef}
            role="listbox"
            aria-multiselectable={multiple || undefined}
            onKeyDown={moveOptionFocus}
          >
            {[...new Set(options.map((option) => option.group))].map((group) => {
              const items = options.filter((option) => option.group === group).map((option) => {
              const selected = selectedValueSet.has(option.value);
              return (
                <button
                  className="ui-menu-item"
                  disabled={option.disabled}
                  key={option.value}
                  role="option"
                  type="button"
                  value={option.value}
                  title={option.title}
                  aria-selected={selected}
                  onClick={() => choose(option)}
                >
                  <span className="model-selector-option-content">
                    <span className="model-selector-option-label">
                      {option.label}
                    </span>
                  </span>
                  {selected ? <Check size={13} aria-hidden="true" /> : null}
                </button>
              );
              });
              return group ? (
                <div role="group" aria-label={group} key={group}>
                  <div className="ui-select-group-label">{group}</div>
                  {items}
                </div>
              ) : <Fragment key="ungrouped">{items}</Fragment>;
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
