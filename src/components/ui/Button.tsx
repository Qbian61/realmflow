import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { Spinner } from "./Motion";

export type ButtonVariant = "neutral" | "primary" | "danger" | "ghost";
export type ButtonSize = "compact" | "default" | "comfortable";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leadingIcon?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "neutral",
      size = "default",
      loading = false,
      leadingIcon,
      className,
      children,
      disabled,
      type = "button",
      ...props
    },
    ref,
  ): JSX.Element {
    return (
      <button
        {...props}
        ref={ref}
        type={type}
        className={[
          "ui-button",
          `ui-button--${variant}`,
          `ui-button--${size}`,
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        aria-busy={loading || undefined}
        disabled={disabled || loading}
      >
        {loading ? (
          <Spinner className="ui-button__spinner" size={12} />
        ) : (
          leadingIcon
        )}
        <span className="ui-button__label">{children}</span>
      </button>
    );
  },
);

export type IconButtonProps = Omit<ButtonProps, "leadingIcon"> & {
  "aria-label": string;
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    { "aria-label": ariaLabel, className, children, ...props },
    ref,
  ): JSX.Element {
    if (!ariaLabel.trim()) {
      throw new Error("IconButton requires a non-empty accessible name");
    }

    return (
      <Button
        {...props}
        ref={ref}
        aria-label={ariaLabel}
        className={["ui-icon-button", className].filter(Boolean).join(" ")}
      >
        {children}
      </Button>
    );
  },
);
