import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import type {
  RequirementExecutionViewDto,
  WorkflowParallelismErrorCode,
} from "../../../shared/business";
import { IconButton } from "../../components/ui";
import { useLocalization } from "../../localization/LocalizationProvider";
import type { Translator } from "../../localization/translate";
import { useToast } from "../toast/ToastProvider";

export function WorkflowParallelismControl({
  view,
  selectedNodeId,
  onReload,
}: {
  view?: RequirementExecutionViewDto;
  selectedNodeId?: string;
  onReload: (nodeId?: string) => Promise<void>;
}): JSX.Element | null {
  const { t } = useLocalization();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const business = window.realmflow?.business;
  const execution = view?.execution;

  if (!view || !execution) return null;

  const update = async (maxParallelism: number): Promise<void> => {
    if (typeof business?.setWorkflowParallelism !== "function") return;
    setPending(true);
    try {
      const result = await business.setWorkflowParallelism({
        requirementId: view.workflow.requirementId,
        maxParallelism,
        expectedWorkflowRevision: view.workflow.revision,
        expectedExecutionRevision: execution.revision,
      });
      if (result.outcome === "rejected") {
        toast.error("requirementDetail.parallelismUpdateFailed", {
          values: {
            error: parallelismErrorLabel(result.error.code, t),
          },
          dedupeKey: "workflow-parallelism-update-failed",
        });
        return;
      }
      await onReload(selectedNodeId);
    } catch {
      toast.error("requirementDetail.parallelismUpdateFailed", {
        values: { error: t("common.unknownError") },
        dedupeKey: "workflow-parallelism-update-failed",
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="workflow-parallelism">
      <div
        className="workflow-parallelism-control"
        aria-label={t("requirementDetail.parallelism")}
      >
        <IconButton
          size="compact"
          variant="neutral"
          aria-label={t("requirementDetail.parallelismDecrease")}
          title={t("requirementDetail.parallelismDecrease")}
          disabled={
            pending ||
            view.maxParallelism <= 1 ||
            typeof business?.setWorkflowParallelism !== "function"
          }
          onClick={() => void update(view.maxParallelism - 1)}
        >
          <Minus size={13} aria-hidden="true" />
        </IconButton>
        <output aria-live="polite">{view.maxParallelism}</output>
        <IconButton
          size="compact"
          variant="neutral"
          aria-label={t("requirementDetail.parallelismIncrease")}
          title={t("requirementDetail.parallelismIncrease")}
          disabled={
            pending ||
            view.maxParallelism >= 8 ||
            typeof business?.setWorkflowParallelism !== "function"
          }
          onClick={() => void update(view.maxParallelism + 1)}
        >
          <Plus size={13} aria-hidden="true" />
        </IconButton>
        <span>
          {t("requirementDetail.parallelismActivity", {
            active: view.activeNodeIds.length,
            limit: view.maxParallelism,
          })}
        </span>
      </div>
    </div>
  );
}

function parallelismErrorLabel(
  code: WorkflowParallelismErrorCode,
  t: Translator,
): string {
  switch (code) {
    case "invalid_parallelism":
      return t("requirementDetail.parallelismError.invalid");
    case "execution_not_configurable":
      return t("requirementDetail.parallelismError.notConfigurable");
    case "revision_conflict":
      return t("requirementDetail.parallelismError.revisionConflict");
    case "artifact_path_conflict":
      return t("requirementDetail.parallelismError.artifactConflict");
    case "persistence_failed":
      return t("requirementDetail.parallelismError.persistence");
  }
}
