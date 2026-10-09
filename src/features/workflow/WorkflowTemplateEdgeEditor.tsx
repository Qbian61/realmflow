import { useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import type {
  BusinessApi,
  WorkflowTemplateDraftDto,
} from "../../../shared/business";
import {
  Button,
  ConfirmDialog,
  Field,
  IconButton,
} from "../../components/ui";
import { useLocalization } from "../../localization/LocalizationProvider";
import { useToast } from "../toast/ToastProvider";

type Props = {
  business: BusinessApi;
  template: WorkflowTemplateDraftDto;
  onChange: (template: WorkflowTemplateDraftDto) => void;
};

export function WorkflowTemplateEdgeEditor({
  business,
  template,
  onChange,
}: Props): JSX.Element {
  const { t } = useLocalization();
  const toast = useToast();
  const nodes = template.currentVersion.nodes
    .slice()
    .sort((left, right) => left.order - right.order);
  const [sourceNodeId, setSourceNodeId] = useState(nodes[0]?.id ?? "");
  const [targetNodeId, setTargetNodeId] = useState(nodes[1]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [pendingEdgeId, setPendingEdgeId] = useState<string>();
  const [deleteError, setDeleteError] = useState("");
  const nodesById = new Map(nodes.map((node) => [node.id, node]));

  async function addEdge(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    try {
      onChange(
        await business.addWorkflowTemplateEdge({
          id: template.id,
          expectedRevision: template.revision,
          sourceNodeId,
          targetNodeId,
        }),
      );
    } catch {
      toast.error("workflowEdge.createFailed");
    } finally {
      setBusy(false);
    }
  }

  async function removeEdge(): Promise<void> {
    if (!pendingEdgeId) return;
    const edge = template.currentVersion.edges.find(
      (candidate) => candidate.id === pendingEdgeId,
    );
    if (!edge) return;
    setBusy(true);
    setDeleteError("");
    try {
      onChange(
        await business.removeWorkflowTemplateEdge({
          id: template.id,
          expectedRevision: template.revision,
          edgeId: edge.id,
        }),
      );
      setPendingEdgeId(undefined);
    } catch {
      setDeleteError(t("workflowEdge.deleteFailed"));
      toast.error("workflowEdge.deleteFailed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="workflow-edge-editor">
      <form className="workflow-edge-form" onSubmit={addEdge}>
        <Field name="workflow-edge-source" label={t("workflowEdge.source")}>
          <select
            aria-label={t("workflowEdge.source")}
            value={sourceNodeId}
            onChange={(event) => setSourceNodeId(event.target.value)}
          >
            {nodes.map((node) => (
              <option key={node.id} value={node.id}>
                {node.name}
              </option>
            ))}
          </select>
        </Field>
        <Field name="workflow-edge-target" label={t("workflowEdge.target")}>
          <select
            aria-label={t("workflowEdge.target")}
            value={targetNodeId}
            onChange={(event) => setTargetNodeId(event.target.value)}
          >
            {nodes.map((node) => (
              <option key={node.id} value={node.id}>
                {node.name}
              </option>
            ))}
          </select>
        </Field>
        <Button
          type="submit"
          size="comfortable"
          variant="primary"
          leadingIcon={<Plus size={15} />}
          disabled={
            busy ||
            nodes.length < 2 ||
            !sourceNodeId ||
            !targetNodeId ||
            sourceNodeId === targetNodeId
          }
        >
          {t("workflowEdge.add")}
        </Button>
      </form>
      <div className="workflow-edge-list">
        {template.currentVersion.edges.map((edge) => {
          const source =
            nodesById.get(edge.sourceNodeId)?.name ?? edge.sourceNodeId;
          const target =
            nodesById.get(edge.targetNodeId)?.name ?? edge.targetNodeId;
          return (
            <div className="workflow-edge-row" key={edge.id}>
              <span>
                {source} → {target}
              </span>
              <IconButton
                variant="ghost"
                aria-label={t("workflowEdge.deleteAria", { source, target })}
                title={t("workflowEdge.delete")}
                disabled={busy}
                onClick={() => {
                  setDeleteError("");
                  setPendingEdgeId(edge.id);
                }}
              >
                <Trash2 size={15} />
              </IconButton>
            </div>
          );
        })}
        {template.currentVersion.edges.length === 0 ? (
          <p className="workflow-template-empty">{t("workflowEdge.empty")}</p>
        ) : null}
      </div>
      <ConfirmDialog
        open={pendingEdgeId !== undefined}
        title={t("workflowEdge.delete")}
        description={(() => {
          const edge = template.currentVersion.edges.find(
            ({ id }) => id === pendingEdgeId,
          );
          if (!edge) return "";
          return t("workflowEdge.deleteConfirm", {
            source:
              nodesById.get(edge.sourceNodeId)?.name ?? edge.sourceNodeId,
            target:
              nodesById.get(edge.targetNodeId)?.name ?? edge.targetNodeId,
          });
        })()}
        confirmLabel={t("workflowEdge.delete")}
        cancelLabel={t("common.cancel")}
        pending={busy}
        error={deleteError}
        onCancel={() => {
          setDeleteError("");
          setPendingEdgeId(undefined);
        }}
        onConfirm={removeEdge}
      />
    </div>
  );
}
