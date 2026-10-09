import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  type ReactElement,
  type ReactNode,
} from "react";

const INVALID_CONTROL_SELECTOR = [
  'input[aria-invalid="true"]',
  'select[aria-invalid="true"]',
  'textarea[aria-invalid="true"]',
  "input:invalid",
  "select:invalid",
  "textarea:invalid",
].join(",");

export function focusFirstInvalidControl(form: HTMLFormElement): void {
  const control = form.querySelector<HTMLElement>(INVALID_CONTROL_SELECTOR);
  if (!control) return;
  control.focus({ preventScroll: true });
  control.scrollIntoView?.({ block: "nearest" });
}

type FieldControlProps = {
  id?: string;
  name?: string;
  disabled?: boolean;
  autoComplete?: string;
  inputMode?:
    | "none"
    | "text"
    | "tel"
    | "url"
    | "email"
    | "numeric"
    | "decimal"
    | "search";
  spellCheck?: boolean;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
};

export type FieldProps = {
  name: string;
  label: ReactNode;
  children: ReactElement<FieldControlProps>;
  autoComplete?: string;
  inputMode?: FieldControlProps["inputMode"];
  spellCheck?: boolean;
  endAdornment?: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  disabled?: boolean;
  required?: boolean;
  className?: string;
};

export function Field({
  name,
  label,
  children,
  autoComplete = "off",
  inputMode,
  spellCheck,
  endAdornment,
  description,
  error,
  disabled = false,
  required = false,
  className,
}: FieldProps): JSX.Element {
  if (!isValidElement<FieldControlProps>(children)) {
    throw new Error("Field requires a single native form control");
  }

  const generatedId = useId();
  const fieldRef = useRef<HTMLDivElement>(null);
  const hadErrorRef = useRef(false);
  const controlId = children.props.id ?? `${generatedId}-control`;
  const descriptionId = description ? `${generatedId}-description` : undefined;
  const errorId = error ? `${generatedId}-error` : undefined;
  const describedBy = [
    children.props["aria-describedby"],
    descriptionId,
    errorId,
  ]
    .filter(Boolean)
    .join(" ");
  const control = cloneElement(children, {
    id: controlId,
    name: children.props.name ?? name,
    disabled: disabled || children.props.disabled,
    autoComplete: children.props.autoComplete ?? autoComplete,
    inputMode: children.props.inputMode ?? inputMode,
    spellCheck: children.props.spellCheck ?? spellCheck,
    "aria-describedby": describedBy || undefined,
    "aria-invalid": error ? "true" : children.props["aria-invalid"],
  });

  useEffect(() => {
    const hasError = Boolean(error);
    if (hasError && !hadErrorRef.current) {
      const form = fieldRef.current?.closest("form");
      if (form) queueMicrotask(() => focusFirstInvalidControl(form));
    }
    hadErrorRef.current = hasError;
  }, [error]);

  return (
    <div
      ref={fieldRef}
      className={["ui-field", className].filter(Boolean).join(" ")}
      data-disabled={disabled || undefined}
      data-invalid={Boolean(error) || undefined}
    >
      <label className="ui-field__label" htmlFor={controlId}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {endAdornment ? (
        <div className="ui-field__control-group">
          {control}
          <span className="ui-field__end-adornment">{endAdornment}</span>
        </div>
      ) : (
        control
      )}
      {description ? (
        <div className="ui-field__description" id={descriptionId}>
          {description}
        </div>
      ) : null}
      {error ? (
        <div className="ui-field__error" id={errorId} role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
