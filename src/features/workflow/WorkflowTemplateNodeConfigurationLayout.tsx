import type { ReactNode } from "react";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
} from "../../components/ui";

export function ConfigurationLayer({
  embedded,
  label,
  onClose,
  children,
}: {
  embedded: boolean;
  label: string;
  onClose: () => void;
  children: ReactNode;
}): JSX.Element {
  if (embedded) {
    return <div className="workflow-node-config-embedded">{children}</div>;
  }
  return (
    <Dialog
      open
      size="wide"
      className="workflow-node-config-dialog"
      aria-label={label}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {children}
    </Dialog>
  );
}

export function ConfigurationHeader({
  embedded,
  children,
}: {
  embedded: boolean;
  children: ReactNode;
}): JSX.Element {
  return embedded ? (
    <header>{children}</header>
  ) : (
    <DialogHeader>{children}</DialogHeader>
  );
}

export function ConfigurationScrollBody({
  embedded,
  children,
}: {
  embedded: boolean;
  children: ReactNode;
}): JSX.Element {
  return embedded ? (
    <>{children}</>
  ) : (
    <DialogBody className="workflow-node-config-dialog__body">
      {children}
    </DialogBody>
  );
}

export function ConfigurationActions({
  embedded,
  children,
}: {
  embedded: boolean;
  children: ReactNode;
}): JSX.Element {
  return embedded ? (
    <footer>{children}</footer>
  ) : (
    <DialogFooter>{children}</DialogFooter>
  );
}
