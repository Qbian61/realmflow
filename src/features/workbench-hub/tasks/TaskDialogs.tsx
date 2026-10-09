import { X } from "lucide-react";
import { useLocalization } from "../../../localization/LocalizationProvider";
import {
  Button,
  ConfirmDialog,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Field,
  IconButton,
} from "../../../components/ui";

export function TaskNameDialog({
  title,
  value,
  onChange,
  onClose,
  onSubmit,
}: {
  title: string;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => Promise<void>;
}): JSX.Element {
  const { t } = useLocalization();
  return (
    <Dialog
      open
      size="compact"
      aria-label={title}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <form
        className="workbench-task-modal-form"
        onSubmit={(event) => {
          event.preventDefault();
          void onSubmit();
        }}
      >
        <DialogHeader>
          <strong>{title}</strong>
          <IconButton
            aria-label={t("workbenchHub.close")}
            title={t("workbenchHub.close")}
            variant="ghost"
            onClick={onClose}
          >
            <X size={16} />
          </IconButton>
        </DialogHeader>
        <DialogBody>
          <Field name="workbench-tasks-name" label={t("workbenchTasks.name")}>
          <input
            data-autofocus
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            {t("workbenchTasks.cancel")}
          </Button>
          <Button type="submit" variant="primary">
            {t("workbenchTasks.create")}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

export function TaskConfirmDialog({
  title,
  message,
  onClose,
  onConfirm,
  confirmDisabled = false,
}: {
  title: string;
  message: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  confirmDisabled?: boolean;
}): JSX.Element {
  const { t } = useLocalization();
  return (
    <ConfirmDialog
      open
      title={title}
      description={message}
      confirmLabel={t("workbenchTasks.delete")}
      cancelLabel={t("workbenchTasks.cancel")}
      pending={confirmDisabled}
      onCancel={onClose}
      onConfirm={onConfirm}
    />
  );
}
