import { Eye } from "lucide-react";
import { useState } from "react";
import type { RequirementExecutionViewDto } from "../../../shared/business";
import { InlineAlert, Spinner } from "../../components/ui";
import { RequirementNodeConversationPanel } from "../conversation/RequirementNodeConversationPanel";
import { useLocalization } from "../../localization/LocalizationProvider";
import type { Translator } from "../../localization/translate";

export function RequirementExecutionSummary({
  view,
  error,
  onRetry,
}: {
  view?: RequirementExecutionViewDto;
  error: string;
  onRetry: () => void;
}): JSX.Element | null {
  const { t } = useLocalization();
  if (!view && !error) return null;

  return (
    <>
      {view ? (
        <section
          className="requirement-execution-summary"
          aria-labelledby="execution-summary-title"
        >
          <div>
            <span id="execution-summary-title">
              {t("workflowExecution.progress")}
            </span>
            <strong>{view.progress.percent}%</strong>
          </div>
          <progress max={100} value={view.progress.percent} />
          <span>
            {t("workflowExecution.completed", {
              completed: view.progress.completedNodes,
              total: view.progress.totalNodes,
            })}
          </span>
          <span>
            {t("workflowExecution.current", {
              name:
                view.nodes.find((node) => node.current)?.name ??
                t("workflowExecution.none"),
            })}
          </span>
        </section>
      ) : null}
      {error ? (
        <InlineAlert
          className="requirement-execution-error"
          tone="danger"
          title={error}
          actionLabel={t("workflowExecution.retry")}
          actionAriaLabel={t("workflowExecution.retryAria")}
          onAction={onRetry}
        />
      ) : null}
    </>
  );
}

export function RequirementExecutionResources({
  view,
  modelProfileId,
  onReload,
  sections = "all",
}: {
  view: RequirementExecutionViewDto;
  modelProfileId?: string;
  onReload: (nodeId: string) => Promise<void>;
  sections?: "all" | "context" | "action";
}): JSX.Element {
  const { t } = useLocalization();
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const snapshot = view.selectedNode.contextSnapshot;
  const selectedNode = view.nodes.find(
    (node) => node.id === view.selectedNode.id,
  );
  const canPreview =
    selectedNode?.type === "ai_generate" &&
    view.selectedNode.nodeRun?.status === "ready" &&
    Boolean(view.execution);
  const previewContext = async (): Promise<void> => {
    const business = window.realmflow?.business;
    const execution = view.execution;
    const nodeRun = view.selectedNode.nodeRun;
    if (!business || !execution || !nodeRun || !canPreview) return;
    setPreviewing(true);
    setPreviewError("");
    try {
      await business.prepareWorkflowNodeContext({
        requirementId: view.workflow.requirementId,
        nodeRunId: nodeRun.id,
        expectedWorkflowRevision: view.workflow.revision,
        expectedExecutionRevision: execution.revision,
        expectedNodeRunRevision: nodeRun.revision,
        ...(modelProfileId ? { modelProfileId } : {}),
      });
      await onReload(view.selectedNode.id);
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error))
        .replace(/^Error invoking remote method '[^']+':\s*/, "")
        .replace(/^[A-Za-z]+Error:\s*/, "");
      setPreviewError(t("workflowExecution.previewFailed", { error: message }));
    } finally {
      setPreviewing(false);
    }
  };
  const previewButton = canPreview ? (
    <button
      type="button"
      disabled={previewing}
      aria-busy={previewing || undefined}
      onClick={() => void previewContext()}
    >
      {previewing ? (
        <Spinner size={13} />
      ) : (
        <Eye size={13} />
      )}
      {previewing
        ? t("workflowExecution.previewing")
        : t("workflowExecution.preview")}
    </button>
  ) : null;
  if (sections === "action") {
    return (
      <div className="execution-context-preview-action">
        <div className="execution-resource-heading">{previewButton}</div>
        {previewError ? (
          <p className="execution-resource-error" role="alert">
            {previewError}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="execution-node-resources">
      <section
        aria-labelledby={sections === "all" ? "context-sources-title" : undefined}
        aria-label={
          sections === "context"
            ? t("workflowExecution.contextSources")
            : undefined
        }
      >
        <div className="execution-resource-heading">
          {sections === "all" ? (
            <h3 id="context-sources-title">
              {t("workflowExecution.contextSources")}
            </h3>
          ) : null}
          {previewButton}
        </div>
        {previewError ? (
          <p className="execution-resource-error" role="alert">
            {previewError}
          </p>
        ) : null}
        {snapshot ? (
          <div className="context-snapshot-preview">
            <div>
              <strong>{snapshot.modelId}</strong>
              <span>
                {t("workflowExecution.policy", {
                  version: snapshot.policyVersion,
                })}
              </span>
              <span>{snapshot.estimatedTokens} tokens</span>
            </div>
            <small>{snapshot.checksum}</small>
            <pre>{snapshot.content}</pre>
          </div>
        ) : null}
        {view.selectedNode.contextSources.length > 0 ? (
          <div className="execution-resource-list">
            {view.selectedNode.contextSources.map((source) => (
              <div key={`${source.kind}:${source.id}`}>
                <strong>{contextSourceLabel(source.kind, t)}</strong>
                <span>{source.id}</span>
                <small>
                  {t("workflowExecution.characters", {
                    included: source.includedCharacters,
                    total: source.characterCount,
                  })}
                  {source.truncated ? t("workflowExecution.truncated") : ""}
                </small>
              </div>
            ))}
          </div>
        ) : (
          <p className="execution-resource-empty">
            {t("workflowExecution.emptyContext")}
          </p>
        )}
      </section>
      {sections === "all" ? <section aria-labelledby="formal-artifacts-title">
        <h3 id="formal-artifacts-title">{t("workflowExecution.artifacts")}</h3>
        {view.selectedNode.artifacts.length > 0 ? (
          <div className="execution-resource-list">
            {view.selectedNode.artifacts.map((artifact) => (
              <div key={artifact.id}>
                <strong>{artifact.relativePath}</strong>
                <span>{artifact.kind}</span>
                <small>
                  v{artifact.version} · {artifact.byteSize} bytes
                </small>
              </div>
            ))}
          </div>
        ) : (
          <p className="execution-resource-empty">
            {t("workflowExecution.emptyArtifacts")}
          </p>
        )}
      </section> : null}
      {sections === "all" && view.selectedNode.nodeRun && selectedNode ? (
        <RequirementNodeConversationPanel
          requirementId={view.workflow.requirementId}
          nodeId={selectedNode.id}
          nodeName={selectedNode.name}
          nodeRunId={view.selectedNode.nodeRun.id}
          conversation={view.selectedNode.conversation}
          interactive={
            selectedNode.current &&
            ["ready", "running", "waiting_user", "paused", "blocked"].includes(
              view.selectedNode.nodeRun.status,
            )
          }
          questions={view.selectedNode.questions}
          onReload={onReload}
        />
      ) : null}
    </div>
  );
}

function contextSourceLabel(
  kind: RequirementExecutionViewDto["selectedNode"]["contextSources"][number]["kind"],
  t: Translator,
): string {
  return t(`workflowExecution.source.${kind}`);
}
