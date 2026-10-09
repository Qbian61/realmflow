import {
  type FormEvent,
  useId,
  useRef,
  useState,
} from "react";
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Field,
} from "../../components/ui";

export type WorkflowNodeActionDialogAction = "skip" | "rollback";

export type WorkflowNodeActionDialogLabels = {
  title: string;
  description: string;
  cancel: string;
  confirm: string;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  reasonRequired?: string;
  impactSummaryLabel?: string;
  impactSummary?: string;
};

type WorkflowNodeActionDialogProps = {
  action: WorkflowNodeActionDialogAction;
  labels: WorkflowNodeActionDialogLabels;
  disabled?: boolean;
  onCancel: () => void;
  onConfirm: (values: { reason?: string }) => void;
};

export function WorkflowNodeActionDialog({
  action,
  labels,
  disabled = false,
  onCancel,
  onConfirm,
}: WorkflowNodeActionDialogProps): JSX.Element {
  const titleId = useId();
  const descriptionId = useId();
  const returnFocusRef = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  const [reason, setReason] = useState("");
  const requiresReason =
    action === "skip" && labels.reasonRequired !== undefined;
  const reasonMissing = requiresReason && !reason.trim();
  const dangerous = action === "rollback";

  function returnFocus(): void {
    returnFocusRef.current?.focus();
  }

  function cancel(): void {
    if (disabled) return;
    onCancel();
    returnFocus();
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (disabled || reasonMissing) return;
    const normalizedReason = reason.trim();
    onConfirm(normalizedReason ? { reason: normalizedReason } : {});
  }

  return (
    <Dialog
      open
      size="compact"
      className="workflow-node-action-dialog"
      backdropClassName="workflow-node-action-dialog-backdrop"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      locked={disabled}
      onOpenChange={(open) => {
        if (!open) cancel();
      }}
    >
      <form
        onSubmit={submit}
      >
        <DialogHeader>
          <h2 id={titleId}>{labels.title}</h2>
        </DialogHeader>
        <DialogBody>
          <p id={descriptionId}>{labels.description}</p>

          {action === "skip" && labels.reasonLabel ? (
            <Field name="workflow-node-action-dialog-reason"
              label={labels.reasonLabel}
              description={requiresReason ? labels.reasonRequired : undefined}
            >
            <textarea
              data-autofocus
              value={reason}
              placeholder={labels.reasonPlaceholder}
              required={requiresReason}
              disabled={disabled}
              aria-label={labels.reasonLabel}
              onChange={(event) => setReason(event.target.value)}
            />
            </Field>
          ) : null}

          {action === "rollback" && labels.impactSummary ? (
            <section
              className="workflow-node-action-dialog-impact"
              aria-label={labels.impactSummaryLabel}
            >
              {labels.impactSummaryLabel ? (
                <strong>{labels.impactSummaryLabel}</strong>
              ) : null}
              <p>{labels.impactSummary}</p>
            </section>
          ) : null}
        </DialogBody>

        <DialogFooter>
          <Button disabled={disabled} onClick={cancel}>
            {labels.cancel}
          </Button>
          <Button
            type="submit"
            variant={dangerous ? "danger" : "primary"}
            disabled={disabled || reasonMissing}
          >
            {labels.confirm}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
