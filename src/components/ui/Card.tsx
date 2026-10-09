import {
  createElement,
  forwardRef,
  type HTMLAttributes,
} from "react";

export type CardProps = HTMLAttributes<HTMLElement> & {
  as?: "div" | "article" | "section";
  density?: "compact" | "default" | "spacious";
  interactive?: boolean;
};

export const Card = forwardRef<HTMLElement, CardProps>(function Card(
  {
    as = "div",
    density = "default",
    interactive = false,
    className,
    ...props
  },
  ref,
): JSX.Element {
  return createElement(as, {
    ...props,
    ref,
    className: [
      "ui-card",
      `ui-card--${density}`,
      interactive && "ui-card--interactive",
      className,
    ]
      .filter(Boolean)
      .join(" "),
  });
});
