import {
  type HTMLAttributes,
} from "react";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  type DialogProps,
} from "./Dialog";

export type DrawerSize = "compact" | "default" | "wide";

export type DrawerProps = Omit<
  DialogProps,
  "size" | "className" | "backdropClassName"
> & {
  size?: DrawerSize;
  className?: string;
};

export function Drawer({
  size = "default",
  className,
  ...props
}: DrawerProps): JSX.Element | null {
  return (
    <Dialog
      {...props}
      closeOnBackdrop={props.closeOnBackdrop ?? true}
      backdropClassName="ui-drawer-backdrop"
      className={[
        "ui-drawer",
        `ui-drawer--${size}`,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}

export function DrawerHeader({
  className,
  ...props
}: HTMLAttributes<HTMLElement>): JSX.Element {
  return (
    <DialogHeader
      {...props}
      className={["ui-drawer__header", className].filter(Boolean).join(" ")}
    />
  );
}

export function DrawerBody({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>): JSX.Element {
  return (
    <DialogBody
      {...props}
      className={["ui-drawer__body", className].filter(Boolean).join(" ")}
    />
  );
}

export function DrawerFooter({
  className,
  ...props
}: HTMLAttributes<HTMLElement>): JSX.Element {
  return (
    <DialogFooter
      {...props}
      className={["ui-drawer__footer", className].filter(Boolean).join(" ")}
    />
  );
}
