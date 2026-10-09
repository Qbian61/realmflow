import type { HTMLAttributes, ReactNode } from "react";

type WorkbenchNavigationItemProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  "children"
> & {
  active?: boolean;
  editing?: boolean;
  dragging?: boolean;
  dropTarget?: boolean;
  primary: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function WorkbenchNavigationItem({
  active = false,
  editing = false,
  dragging = false,
  dropTarget = false,
  primary,
  actions,
  className,
  ...attributes
}: WorkbenchNavigationItemProps): JSX.Element {
  return (
    <div
      className={[
        "workbench-navigation-item",
        className,
      ].filter(Boolean).join(" ")}
      data-testid="workbench-navigation-item"
      data-active={active || undefined}
      data-editing={editing || undefined}
      data-dragging={dragging || undefined}
      data-drop-target={dropTarget ? "before" : undefined}
      {...attributes}
    >
      <div className="workbench-navigation-item-primary">{primary}</div>
      {editing || !actions ? null : (
        <div className="workbench-navigation-item-actions">{actions}</div>
      )}
    </div>
  );
}
