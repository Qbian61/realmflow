import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { WorkbenchTaskSelectOption } from "../../../../shared/workbench-tasks";

type TaskMultiSelectTagEditorProps = {
  id?: string;
  options: readonly WorkbenchTaskSelectOption[];
  value: readonly string[];
  ariaLabel: string;
  autoOpen?: boolean;
  disabled?: boolean;
  onChange: (value: string[]) => void;
  onCommit?: (value: string[]) => void;
  onCancel?: () => void;
};

export function TaskMultiSelectTagEditor({
  id,
  options,
  value,
  ariaLabel,
  autoOpen = false,
  disabled = false,
  onChange,
  onCommit,
  onCancel,
}: TaskMultiSelectTagEditorProps): JSX.Element {
  const [open, setOpen] = useState(autoOpen);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    if (autoOpen) triggerRef.current?.focus();
  }, [autoOpen]);

  useEffect(() => {
    if (!open || !onCommit) return;
    const commitOutside = (event: PointerEvent): void => {
      if (rootRef.current?.contains(event.target as Node)) return;
      onCommit([...valueRef.current]);
    };
    document.addEventListener("pointerdown", commitOutside);
    return () => document.removeEventListener("pointerdown", commitOutside);
  }, [onCommit, open]);

  const selectedIds = new Set(value);
  const selectedOptions = options.filter((option) =>
    selectedIds.has(option.id),
  );
  const toggleOption = (optionId: string): void => {
    const nextSelectedIds = new Set(value);
    if (nextSelectedIds.has(optionId)) {
      nextSelectedIds.delete(optionId);
    } else {
      nextSelectedIds.add(optionId);
    }
    onChange(
      options
        .filter((option) => nextSelectedIds.has(option.id))
        .map((option) => option.id),
    );
  };

  return (
    <div
      ref={rootRef}
      className="workbench-task-multi-select"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        if (onCancel) onCancel();
        else setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className="workbench-task-multi-select-trigger"
        aria-label={ariaLabel}
        aria-expanded={open}
        disabled={disabled || options.length === 0}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && open && onCommit) {
            event.preventDefault();
            onCommit([...value]);
          }
        }}
      >
        <span className="workbench-task-multi-select-values">
          {selectedOptions.length === 0 ? (
            <span className="empty">-</span>
          ) : (
            selectedOptions.map((option) => (
              <span
                key={option.id}
                className="workbench-task-option-tag"
                data-color={option.color}
              >
                {option.label}
              </span>
            ))
          )}
        </span>
        <ChevronDown size={13} aria-hidden="true" />
      </button>
      {open ? (
        <div
          className="ui-popover workbench-task-multi-select-menu"
          role="group"
          aria-label={ariaLabel}
        >
          {options.map((option) => {
            const selected = selectedIds.has(option.id);
            return (
              <button
                key={option.id}
                type="button"
                className="ui-menu-item"
                role="checkbox"
                aria-checked={selected}
                aria-label={option.label}
                onClick={() => toggleOption(option.id)}
              >
                <span
                  className="workbench-task-option-tag"
                  data-color={option.color}
                >
                  {option.label}
                </span>
                <Check
                  size={13}
                  aria-hidden="true"
                  data-visible={selected || undefined}
                />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
