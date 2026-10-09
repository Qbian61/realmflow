import type { WorkflowTemplateDraftDto } from "../../../../shared/business";
import { ConfirmDialog } from "../../../components/ui";
import { useLocalization } from "../../../localization/LocalizationProvider";

export type WorkflowCanvasPendingDeletion =
  | {
      kind: "node";
      node: WorkflowTemplateDraftDto["currentVersion"]["nodes"][number];
      edges: WorkflowTemplateDraftDto["currentVersion"]["edges"];
      description: string;
    }
  | {
      kind: "edge";
      edge: WorkflowTemplateDraftDto["currentVersion"]["edges"][number];
      description: string;
    };

export function WorkflowCanvasDeletionDialog({
  kind,
  description,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  kind?: "node" | "edge";
  description: string;
  pending: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}): JSX.Element {
  const { t } = useLocalization();

  return (
    <ConfirmDialog
      open={Boolean(kind)}
      title={
        kind === "edge"
          ? t("workflowEdge.delete")
          : t("workflowCanvas.deleteNode")
      }
      description={description}
      confirmLabel={t("dialog.delete")}
      cancelLabel={t("common.cancel")}
      pending={pending}
      error={error}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
