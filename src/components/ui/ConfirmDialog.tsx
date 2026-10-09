import { useId, type ReactNode } from "react";
import { Button, type ButtonVariant } from "./Button";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
} from "./Dialog";
import { InlineAlert } from "./InlineAlert";

export type ConfirmDialogProps = {
  open: boolean;
  title: ReactNode;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  variant?: Exclude<ButtonVariant, "ghost">;
  pending?: boolean;
  error?: ReactNode;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  variant = "danger",
  pending = false,
  error,
  onCancel,
  onConfirm,
}: ConfirmDialogProps): JSX.Element {
  const titleId = useId();

  return (
    <Dialog
      open={open}
      size="compact"
      locked={pending}
      closeOnBackdrop={!pending}
      aria-labelledby={titleId}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !pending) onCancel();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!pending) void onConfirm();
        }}
      >
        <DialogHeader>
          <h2 id={titleId}>{title}</h2>
        </DialogHeader>
        <DialogBody>
          <p>{description}</p>
          {error ? (
            <InlineAlert tone="danger" title={error} />
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            data-autofocus
            disabled={pending}
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>
          <Button
            type="submit"
            variant={variant}
            loading={pending}
            disabled={pending}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
