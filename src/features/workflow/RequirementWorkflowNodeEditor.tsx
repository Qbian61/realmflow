import {
  ArrowLeft,
  ArrowRight,
  Braces,
  ClipboardCheck,
  FileSearch,
  GitBranch,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  forwardRef,
  useImperativeHandle,
  useState,
  type FormEvent,
} from "react";
import type {
  RequirementNode,
  RequirementWorkflow,
} from "../../../domain/workflow";
import type { RequirementExecutionViewDto } from "../../../shared/business";
import { useLocalization } from "../../localization/LocalizationProvider";
import { useToast } from "../toast/ToastProvider";
import { TemplateMigrationDialog } from "./TemplateMigrationDialog";
import { WorkflowParallelismControl } from "./WorkflowParallelismControl";
import { nodeStatusLabel } from "./workflow-view";

type RequirementWorkflowNodeEditorProps = {
  requirementId: string;
  workflow: RequirementWorkflow | undefined;
  nodes: RequirementNode[];
  selectedNode: RequirementNode | undefined;
  activeNodeId: string;
  executionView?: RequirementExecutionViewDto;
  onReloadExecutionView?: (nodeId?: string) => Promise<void>;
  onSelectNode: (node: RequirementNode) => void;
  onWorkflowChange: (workflow: RequirementWorkflow) => void;
  onTemplateMigrationApplied?: (workflow: RequirementWorkflow) => void;
  showTrack?: boolean;
};

export type RequirementWorkflowNodeEditorHandle = {
  addNode: () => void;
  editEdges: () => void;
  migrateTemplate: () => void;
};

export const RequirementWorkflowNodeEditor = forwardRef<
  RequirementWorkflowNodeEditorHandle,
  RequirementWorkflowNodeEditorProps
>(function RequirementWorkflowNodeEditor(
  {
    requirementId,
    workflow,
    nodes,
    selectedNode,
    activeNodeId,
    executionView,
    onReloadExecutionView = async () => undefined,
    onSelectNode,
    onWorkflowChange,
    onTemplateMigrationApplied = onWorkflowChange,
    showTrack = true,
  },
  ref,
): JSX.Element {
  const { t } = useLocalization();
  const toast = useToast();
  const [addingNode, setAddingNode] = useState(false);
  const [nodeName, setNodeName] = useState("");
  const [editingNodeId, setEditingNodeId] = useState<string>();
  const [editNodeName, setEditNodeName] = useState("");
  const [editNodeDescription, setEditNodeDescription] = useState("");
  const [editNodeAllowSkip, setEditNodeAllowSkip] = useState(false);
  const [editingEdges, setEditingEdges] = useState(false);
  const [selectedEdgeId, setSelectedEdgeId] = useState("");
  const [edgeSourceNodeId, setEdgeSourceNodeId] = useState("");
  const [edgeTargetNodeId, setEdgeTargetNodeId] = useState("");
  const [pending, setPending] = useState(false);
  const [migratingTemplate, setMigratingTemplate] = useState(false);
  const activeNodeIdSet = new Set(executionView?.activeNodeIds ?? []);
  const editingNode = workflow?.nodes.find((node) => node.id === editingNodeId);
  const editableNodeIds = new Set(
    workflow?.nodes
      .filter((node) => isTopologyEditable(node))
      .map((node) => node.id) ?? [],
  );
  const editableEdges =
    workflow?.edges.filter(
      (edge) =>
        editableNodeIds.has(edge.sourceNodeId) &&
        editableNodeIds.has(edge.targetNodeId),
    ) ?? [];

  const selectEdge = (edgeId: string): void => {
    const edge = workflow?.edges.find((item) => item.id === edgeId);
    if (!edge) return;
    setSelectedEdgeId(edge.id);
    setEdgeSourceNodeId(edge.sourceNodeId);
    setEdgeTargetNodeId(edge.targetNodeId);
  };

  const beginEdgeEdit = (): void => {
    const edge = editableEdges[0];
    if (!edge) return;
    selectEdge(edge.id);
    setEditingEdges(true);
  };

  const beginEdit = (node: RequirementNode): void => {
    onSelectNode(node);
    setEditingNodeId(node.id);
    setEditNodeName(node.name);
    setEditNodeDescription(node.description);
    setEditNodeAllowSkip(node.allowSkip);
  };

  useImperativeHandle(
    ref,
    () => ({
      addNode: () => setAddingNode(true),
      editEdges: beginEdgeEdit,
      migrateTemplate: () => setMigratingTemplate(true),
    }),
    [beginEdgeEdit],
  );

  const insertNode = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    const business = window.realmflow?.business;
    const name = nodeName.trim();
    if (!business || !workflow || !name) return;
    const nodeId = `${requirementId}:custom:${crypto.randomUUID()}`;
    setPending(true);
    try {
      const next = await business.insertWorkflowNode({
        requirementId,
        expectedRevision: workflow.revision,
        node: {
          id: nodeId,
          type: "ai_generate",
          name,
          description: "",
          order: nodes.length,
          status: "pending",
          allowSkip: true,
          executor: {
            kind: "ai_generate",
            prompt: t("requirementWorkflow.defaultPrompt", { name }),
            artifact: {
              relativePath: `artifacts/${nodeId.split(":").at(-1)}.md`,
              kind: "markdown",
            },
          },
        },
        ...(selectedNode ? { afterNodeId: selectedNode.id } : {}),
      });
      onWorkflowChange(next);
      setNodeName("");
      setAddingNode(false);
    } catch {
      toast.error("requirementWorkflow.addNodeFailed", {
        values: { error: t("common.unknownError") },
      });
    } finally {
      setPending(false);
    }
  };

  const updateNode = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    const business = window.realmflow?.business;
    const name = editNodeName.trim();
    if (!business || !workflow || !editingNode || !name) return;
    setPending(true);
    try {
      const next = await business.updateWorkflowNode({
        requirementId,
        expectedRevision: workflow.revision,
        nodeId: editingNode.id,
        changes: {
          name,
          description: editNodeDescription.trim(),
          allowSkip: editNodeAllowSkip,
        },
      });
      onWorkflowChange(next);
      setEditingNodeId(undefined);
    } catch {
      toast.error("requirementWorkflow.saveNodeFailed", {
        values: { error: t("common.unknownError") },
      });
    } finally {
      setPending(false);
    }
  };

  const removeNode = async (node: RequirementNode): Promise<void> => {
    const business = window.realmflow?.business;
    if (!business || !workflow) return;
    setPending(true);
    try {
      const next = await business.removeWorkflowNode({
        requirementId,
        expectedRevision: workflow.revision,
        nodeId: node.id,
      });
      onWorkflowChange(next);
      if (editingNodeId === node.id) setEditingNodeId(undefined);
    } catch {
      toast.error("requirementWorkflow.deleteNodeFailed", {
        values: { error: t("common.unknownError") },
      });
    } finally {
      setPending(false);
    }
  };

  const updateEdge = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    const business = window.realmflow?.business;
    if (
      !business ||
      !workflow ||
      !selectedEdgeId ||
      !edgeSourceNodeId ||
      !edgeTargetNodeId
    ) {
      return;
    }
    setPending(true);
    try {
      const next = await business.updateWorkflowEdge({
        requirementId,
        expectedRevision: workflow.revision,
        edgeId: selectedEdgeId,
        edge: {
          id: selectedEdgeId,
          sourceNodeId: edgeSourceNodeId,
          targetNodeId: edgeTargetNodeId,
        },
      });
      onWorkflowChange(next);
      setEditingEdges(false);
    } catch {
      toast.error("requirementWorkflow.saveEdgeFailed", {
        values: { error: t("common.unknownError") },
      });
    } finally {
      setPending(false);
    }
  };

  const moveNode = async (
    node: RequirementNode,
    direction: -1 | 1,
  ): Promise<void> => {
    const business = window.realmflow?.business;
    if (!business || !workflow) return;
    const currentIndex = nodes.findIndex((item) => item.id === node.id);
    const targetIndex = currentIndex + direction;
    const target = nodes[targetIndex];
    if (
      currentIndex < 0 ||
      !target ||
      !isTopologyEditable(node) ||
      !isTopologyEditable(target)
    ) {
      return;
    }
    const orderedNodeIds = nodes.map((item) => item.id);
    [orderedNodeIds[currentIndex], orderedNodeIds[targetIndex]] = [
      orderedNodeIds[targetIndex],
      orderedNodeIds[currentIndex],
    ];
    setPending(true);
    try {
      const next = await business.reorderWorkflowNodes({
        requirementId,
        expectedRevision: workflow.revision,
        orderedNodeIds,
      });
      onWorkflowChange(next);
    } catch {
      toast.error("requirementWorkflow.reorderFailed", {
        values: { error: t("common.unknownError") },
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <div className="development-flow-heading">
        <div>
          <span>DELIVERY PIPELINE</span>
          <h2 id="development-flow-title">{t("requirementWorkflow.title")}</h2>
        </div>
        <div className="requirement-flow-actions">
          <WorkflowParallelismControl
            view={executionView}
            selectedNodeId={activeNodeId}
            onReload={onReloadExecutionView}
          />
          {workflow &&
          typeof window.realmflow?.business
            ?.listTemplateMigrationCandidates === "function" ? (
            <button
              type="button"
              className="template-migration-trigger"
              aria-label={t("templateMigration.action")}
              title={t("templateMigration.action")}
              disabled={pending}
              onClick={() => setMigratingTemplate(true)}
            >
              <RefreshCw size={14} />
              <span>{t("templateMigration.action")}</span>
            </button>
          ) : null}
          <strong>
            {Math.max(
              1,
              nodes.findIndex((node) => node.id === selectedNode?.id) + 1,
            )}{" "}
            / {nodes.length}
          </strong>
          {editableEdges.length > 0 ? (
            <button
              type="button"
              aria-label={t("requirementWorkflow.editEdges")}
              title={t("requirementWorkflow.editEdges")}
              disabled={pending}
              onClick={beginEdgeEdit}
            >
              <GitBranch size={15} />
            </button>
          ) : null}
          {workflow &&
          (!selectedNode ||
            ["pending", "ready"].includes(selectedNode.status)) ? (
            <button
              type="button"
              aria-label={t("requirementWorkflow.insertNode")}
              title={t("requirementWorkflow.insertNode")}
              disabled={pending}
              onClick={() => setAddingNode(true)}
            >
              <Plus size={15} />
            </button>
          ) : null}
        </div>
      </div>
      {migratingTemplate ? (
        <TemplateMigrationDialog
          requirementId={requirementId}
          onApplied={onTemplateMigrationApplied}
          onClose={() => setMigratingTemplate(false)}
        />
      ) : null}
      {editingEdges && workflow ? (
        <form
          className="workflow-node-editor workflow-edge-editor"
          onSubmit={(event) => void updateEdge(event)}
        >
          <label>
            <span>{t("workflowEditor.edges")}</span>
            <select name="requirement-workflow-select-edge" autoComplete="off"
              aria-label={t("requirementWorkflow.selectEdge")}
              value={selectedEdgeId}
              onChange={(event) => selectEdge(event.target.value)}
            >
              {editableEdges.map((edge) => (
                <option value={edge.id} key={edge.id}>
                  {nodeNameForId(nodes, edge.sourceNodeId)} →{" "}
                  {nodeNameForId(nodes, edge.targetNodeId)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t("workflowEdge.source")}</span>
            <select name="requirement-workflow-edge-source" autoComplete="off"
              aria-label={t("requirementWorkflow.edgeSource")}
              value={edgeSourceNodeId}
              onChange={(event) => setEdgeSourceNodeId(event.target.value)}
            >
              {nodes.filter(isTopologyEditable).map((node) => (
                <option value={node.id} key={node.id}>
                  {node.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t("workflowEdge.target")}</span>
            <select name="requirement-workflow-edge-target" autoComplete="off"
              aria-label={t("requirementWorkflow.edgeTarget")}
              value={edgeTargetNodeId}
              onChange={(event) => setEdgeTargetNodeId(event.target.value)}
            >
              {nodes.filter(isTopologyEditable).map((node) => (
                <option value={node.id} key={node.id}>
                  {node.name}
                </option>
              ))}
            </select>
          </label>
          <div className="workflow-node-editor-actions">
            <button
              type="submit"
              disabled={
                pending ||
                !edgeSourceNodeId ||
                !edgeTargetNodeId ||
                edgeSourceNodeId === edgeTargetNodeId
              }
            >
              {t("requirementWorkflow.saveEdge")}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setEditingEdges(false)}
            >
              {t("common.cancel")}
            </button>
          </div>
        </form>
      ) : null}
      {addingNode && workflow ? (
        <form
          className="workflow-node-editor"
          onSubmit={(event) => void insertNode(event)}
        >
          <input name="workflow-editor-node-name" autoComplete="off"
            autoFocus
            aria-label={t("workflowEditor.nodeName")}
            placeholder={t("workflowEditor.nodeName")}
            value={nodeName}
            onChange={(event) => setNodeName(event.target.value)}
          />
          <button type="submit" disabled={!nodeName.trim() || pending}>
            {t("requirementWorkflow.add")}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setAddingNode(false)}
          >
            {t("common.cancel")}
          </button>
        </form>
      ) : null}
      {editingNode ? (
        <form
          className="workflow-node-editor workflow-node-edit-form"
          onSubmit={(event) => void updateNode(event)}
        >
          <label>
            <span>{t("requirementWorkflow.name")}</span>
            <input name="requirement-workflow-edit-name" autoComplete="off"
              autoFocus
              aria-label={t("requirementWorkflow.editName")}
              value={editNodeName}
              onChange={(event) => setEditNodeName(event.target.value)}
            />
          </label>
          <label>
            <span>{t("requirementWorkflow.description")}</span>
            <textarea name="requirement-workflow-node-description" autoComplete="off"
              aria-label={t("requirementWorkflow.nodeDescription")}
              value={editNodeDescription}
              onChange={(event) => setEditNodeDescription(event.target.value)}
            />
          </label>
          <label className="workflow-node-checkbox">
            <input name="requirement-workflow-allow-skip-aria" autoComplete="off"
              type="checkbox"
              aria-label={t("requirementWorkflow.allowSkipAria")}
              checked={editNodeAllowSkip}
              onChange={(event) => setEditNodeAllowSkip(event.target.checked)}
            />
            <span>{t("workflowEditor.allowSkip")}</span>
          </label>
          <div className="workflow-node-editor-actions">
            <button type="submit" disabled={!editNodeName.trim() || pending}>
              {t("workflowEditor.saveNode")}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setEditingNodeId(undefined)}
            >
              {t("common.cancel")}
            </button>
          </div>
        </form>
      ) : null}
      {showTrack ? <ol className="development-flow-track">
        {nodes.map((node) => {
          const Icon = iconForNode(node);
          const active = activeNodeIdSet.has(node.id);
          const focused = executionView?.focusedNodeId === node.id;
          return (
            <li
              className={[
                ["ready", "running"].includes(node.status) ? "current" : "",
                active ? "active" : "",
                focused ? "focused" : "",
                activeNodeId === node.id ? "selected" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              key={node.id}
            >
              <button
                type="button"
                aria-label={t("requirementWorkflow.openNode", {
                  name: node.name,
                })}
                aria-pressed={activeNodeId === node.id}
                aria-current={focused ? "step" : undefined}
                onClick={() => onSelectNode(node)}
              >
                <div className="development-flow-node">
                  <Icon size={18} strokeWidth={1.8} />
                </div>
                <div className="development-flow-copy">
                  <strong>{node.name}</strong>
                  <span>{nodeStatusLabel(node.status, t)}</span>
                  {active ? (
                    <span className="development-flow-activity">
                      {t("requirementDetail.parallelismActive")}
                    </span>
                  ) : null}
                </div>
              </button>
              {workflow && ["pending", "ready"].includes(node.status) ? (
                <div className="workflow-node-actions">
                  <button
                    type="button"
                    aria-label={t("requirementWorkflow.moveBefore", {
                      name: node.name,
                    })}
                    title={t("tooltip.moveUp")}
                    disabled={
                      pending ||
                      !isTopologyEditable(
                        nodes[
                          nodes.findIndex((item) => item.id === node.id) - 1
                        ],
                      )
                    }
                    onClick={() => void moveNode(node, -1)}
                  >
                    <ArrowLeft size={13} />
                  </button>
                  <button
                    type="button"
                    aria-label={t("requirementWorkflow.moveAfter", {
                      name: node.name,
                    })}
                    title={t("tooltip.moveDown")}
                    disabled={
                      pending ||
                      !isTopologyEditable(
                        nodes[
                          nodes.findIndex((item) => item.id === node.id) + 1
                        ],
                      )
                    }
                    onClick={() => void moveNode(node, 1)}
                  >
                    <ArrowRight size={13} />
                  </button>
                  <button
                    type="button"
                    className="workflow-node-edit"
                    aria-label={t("requirementWorkflow.editNode", {
                      name: node.name,
                    })}
                    title={t("tooltip.edit")}
                    disabled={pending}
                    onClick={() => beginEdit(node)}
                  >
                    <Pencil size={13} />
                  </button>
                  {node.status === "pending" ? (
                    <button
                      type="button"
                      className="workflow-node-delete"
                      aria-label={t("requirementWorkflow.deleteNode", {
                        name: node.name,
                      })}
                      title={t("tooltip.delete")}
                      disabled={pending}
                      onClick={() => void removeNode(node)}
                    >
                      <Trash2 size={13} />
                    </button>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol> : null}
    </>
  );
});

function iconForNode(node: RequirementNode) {
  const icons = {
    ai_generate: Sparkles,
    human_input: FileSearch,
    tool: Braces,
    approval: ClipboardCheck,
  };
  return icons[node.type];
}

function isTopologyEditable(
  node: RequirementNode | undefined,
): node is RequirementNode {
  return node?.status === "pending" || node?.status === "ready";
}

function nodeNameForId(nodes: RequirementNode[], nodeId: string): string {
  return nodes.find((node) => node.id === nodeId)?.name ?? nodeId;
}
