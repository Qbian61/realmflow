import type { NodeTodoDto } from "../../../shared/business";
import { useLocalization } from "../../localization/LocalizationProvider";
import { ConfirmDialog } from "../../components/ui";

type NodeTodoDeleteDialogProps = {
  todo: NodeTodoDto;
  disabled: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function NodeTodoDeleteDialog({
  todo,
  disabled,
  onCancel,
  onConfirm,
}: NodeTodoDeleteDialogProps): JSX.Element {
  const { t } = useLocalization();

  return (
    <ConfirmDialog
      open
      title={t("requirementDetail.todoDeleteTitle")}
      description={t("requirementDetail.todoDeleteDescription", {
        title: todo.title,
      })}
      confirmLabel={t("requirementDetail.todoDeleteConfirm")}
      cancelLabel={t("common.cancel")}
      pending={disabled}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
