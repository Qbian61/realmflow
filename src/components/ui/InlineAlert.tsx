import {
  forwardRef,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { Button } from "./Button";

export type AlertTone = "info" | "warning" | "danger";

export type InlineAlertProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  "title"
> & {
  tone?: AlertTone;
  title: ReactNode;
  actionLabel?: string;
  actionAriaLabel?: string;
  actionLoading?: boolean;
  actionDisabled?: boolean;
  onAction?: () => void;
};

export const InlineAlert = forwardRef<HTMLDivElement, InlineAlertProps>(
  function InlineAlert(
    {
      tone = "info",
      title,
      actionLabel,
      actionAriaLabel,
      actionLoading = false,
      actionDisabled = false,
      onAction,
      className,
      children,
      ...props
    },
    ref,
  ): JSX.Element {
    return (
      <div
        {...props}
        ref={ref}
        role={props.role ?? (tone === "danger" ? "alert" : "status")}
        className={[
          "ui-inline-alert",
          `ui-inline-alert--${tone}`,
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="ui-inline-alert__content">
          <strong>{title}</strong>
          {children ? <div>{children}</div> : null}
        </div>
        {actionLabel && onAction ? (
          <Button
            aria-label={actionAriaLabel}
            size="compact"
            variant="ghost"
            loading={actionLoading}
            disabled={actionDisabled}
            onClick={onAction}
          >
            {actionLabel}
          </Button>
        ) : null}
      </div>
    );
  },
);
