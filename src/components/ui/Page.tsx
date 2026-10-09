import {
  forwardRef,
  type HTMLAttributes,
  type Ref,
} from "react";

export type PageBodyMode = "contained" | "wide" | "workspace" | "split";

export const PageShell = forwardRef<
  HTMLElement,
  HTMLAttributes<HTMLElement>
>(function PageShell({ className, ...props }, ref): JSX.Element {
  return (
    <section
      {...props}
      ref={ref}
      className={["ui-page", className].filter(Boolean).join(" ")}
    />
  );
});

export const PageHeader = forwardRef<
  HTMLElement,
  HTMLAttributes<HTMLElement>
>(function PageHeader({ className, ...props }, ref): JSX.Element {
  return (
    <header
      {...props}
      ref={ref}
      className={["ui-page__header", className].filter(Boolean).join(" ")}
    />
  );
});

export type PageBodyProps = HTMLAttributes<HTMLElement> & {
  as?: "div" | "main";
  mode?: PageBodyMode;
};

export const PageBody = forwardRef<HTMLElement, PageBodyProps>(
  function PageBody(
    { as = "div", mode = "contained", className, ...props },
    ref,
  ): JSX.Element {
    const resolvedClassName = [
      "ui-page__body",
      `ui-page__body--${mode}`,
      className,
    ]
      .filter(Boolean)
      .join(" ");

    if (as === "main") {
      return <main {...props} ref={ref} className={resolvedClassName} />;
    }
    return (
      <div
        {...props}
        ref={ref as Ref<HTMLDivElement>}
        className={resolvedClassName}
      />
    );
  },
);

export const PageContainer = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(function PageContainer({ className, ...props }, ref): JSX.Element {
  return (
    <div
      {...props}
      ref={ref}
      className={["ui-page__container", className].filter(Boolean).join(" ")}
    />
  );
});
