import {
  forwardRef,
  type HTMLAttributes,
  type ReactNode,
} from "react";

export type EmptyStateProps = HTMLAttributes<HTMLDivElement> & {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
};

export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(
  function EmptyState(
    {
      title,
      description,
      icon,
      action,
      className,
      ...props
    },
    ref,
  ): JSX.Element {
    return (
      <div
        {...props}
        ref={ref}
        className={["ui-empty-state", className].filter(Boolean).join(" ")}
      >
        {icon ? <div className="ui-empty-state__icon">{icon}</div> : null}
        <strong>{title}</strong>
        {description ? <p>{description}</p> : null}
        {action ? <div className="ui-empty-state__action">{action}</div> : null}
      </div>
    );
  },
);
