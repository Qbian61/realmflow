import {
  forwardRef,
  type HTMLAttributes,
} from "react";

export type ToolbarProps = HTMLAttributes<HTMLDivElement> & {
  variant?: "default" | "workspace-header";
};

export const Toolbar = forwardRef<
  HTMLDivElement,
  ToolbarProps
>(function Toolbar(
  { variant = "default", className, ...props },
  ref,
): JSX.Element {
  return (
    <div
      {...props}
      ref={ref}
      role={props.role ?? "toolbar"}
      className={[
        "ui-toolbar",
        variant === "workspace-header"
          ? "ui-toolbar--workspace-header"
          : undefined,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
});
