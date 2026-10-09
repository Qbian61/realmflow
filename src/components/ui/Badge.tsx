import {
  forwardRef,
  type HTMLAttributes,
} from "react";

export type BadgeTone =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info";

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
};

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  function Badge(
    { tone = "neutral", className, ...props },
    ref,
  ): JSX.Element {
    return (
      <span
        {...props}
        ref={ref}
        className={[
          "ui-badge",
          `ui-badge--${tone}`,
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      />
    );
  },
);
