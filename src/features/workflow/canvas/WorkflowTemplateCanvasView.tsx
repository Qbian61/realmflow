import {
  ArrowLeft,
  Copy,
  GitBranchPlus,
  PanelRightOpen,
  Plus,
  Rocket,
} from "lucide-react";
import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type Connection,
  type Edge,
  type NodeChange,
  type Viewport,
} from "@xyflow/react";
import type {
  BusinessApi,
  ConnectorDto,
  ModelPoolDto,
  WorkflowTemplateDraftDto,
  WorkflowTemplatePublicationIssueDto,
} from "../../../../shared/business";
import type {
  WorkflowNodeConfiguration,
  WorkflowNodePosition,
  WorkflowNodeType,
} from "../../../../domain/workflow";
import { useState, type RefObject } from "react";
import {
  Badge,
  Button,
  IconButton,
  PageBody,
  PageHeader,
} from "../../../components/ui";
import { WorkspaceHeaderPortal } from "../../navigation/WorkspaceLayout";
import { useLocalization } from "../../../localization/LocalizationProvider";
import { WorkflowCanvasNodeView } from "./WorkflowCanvasNode";
import { WorkflowCanvasIssueFocus } from "./WorkflowCanvasIssueFocus";
import { WorkflowCanvasKeyboardShortcuts } from "./WorkflowCanvasKeyboardShortcuts";
import { WorkflowCanvasOperationError } from "./WorkflowCanvasOperationError";
import { WorkflowCanvasToolbar } from "./WorkflowCanvasToolbar";
import {
  WorkflowNodeCreateDialog,
  type WorkflowNodeCreateValues,
} from "./WorkflowNodeCreateDialog";
import { WorkflowNodeQuickMenu } from "./WorkflowNodeQuickMenu";
import {
  WorkflowNodeInspector,
  type WorkflowNodeInspectorHandle,
} from "./WorkflowNodeInspector";
import { WorkflowPublicationIssues } from "./WorkflowPublicationIssues";
import type { WorkflowCanvasNode } from "./workflow-canvas-model";
import type { WorkflowCanvasPreferences } from "./workflow-canvas-preferences";
import { createUniqueStableKey } from "./workflow-canvas-actions";
import { useWorkflowCanvasVersionActions } from "./use-workflow-canvas-version-actions";
import {
  clampWorkflowQuickMenuPosition,
  isWorkflowCanvasConnectionValid,
} from "./workflow-canvas-graph";

const WORKFLOW_NODE_TYPES = {
  workflowNode: WorkflowCanvasNodeView,
};

export type WorkflowCanvasNodeCreateInput = WorkflowNodeCreateValues & {
  position: WorkflowNodePosition;
};

type Props = {
  business?: BusinessApi;
  template?: WorkflowTemplateDraftDto;
  loading: boolean;
  loadError: string;
  operationError: string;
  revisionConflict: boolean;
  recoveryText: string;
  saving: boolean;
  readOnly: boolean;
  versionId?: string;
  preferences: WorkflowCanvasPreferences;
  models: ModelPoolDto;
  connectors: ConnectorDto[];
  nodes: WorkflowCanvasNode[];
  edges: Edge[];
  selectedNodeId?: string;
  selectedEdgeId?: string;
  historyState: { canUndo: boolean; canRedo: boolean };
  publicationIssues: WorkflowTemplatePublicationIssueDto[];
  inspectorRef: RefObject<WorkflowNodeInspectorHandle>;
  issueFocus: { requestId: number; nodeIds: string[] };
  onAdd: (values: WorkflowCanvasNodeCreateInput) => void;
  onCopy: () => void;
  onCopyNode: (nodeId: string) => void;
  onDeleteNode: () => void;
  onDeleteNodeById: (nodeId: string) => void;
  onDeleteEdge: () => void;
  onConnect: (targetNodeId: string) => void;
  onFlowConnect: (connection: Connection) => void;
  onAutoLayout: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSelectAll: () => void;
  onViewportChange: (viewport: Viewport) => void;
  onNodesChange: (changes: NodeChange<WorkflowCanvasNode>[]) => void;
  onNodeDragStart: () => void;
  onNodeDragStop: (nodeId: string) => void;
  onNodeSelect: (nodeId: string) => void;
  onEdgeSelect: (edgeId: string) => void;
  onClearSelection: () => void;
  onPublish: () => void;
  onBack: () => void;
  onOpenInspector: () => void;
  onCloseInspector: () => void;
  onConfigure: (
    nodeId: string,
    configuration: WorkflowNodeConfiguration,
  ) => Promise<boolean>;
  onTemplateChange: (template: WorkflowTemplateDraftDto) => void;
  onUpdateNode: (input: {
    nodeId: string;
    name: string;
    description: string;
    type: WorkflowNodeType;
    allowSkip: boolean;
  }) => Promise<boolean>;
  onUpdateTemplate: (input: {
    name: string;
    description: string;
  }) => Promise<boolean>;
  onInspectorDirtyChange: (dirty: boolean) => void;
  onIssueSelect: (issue: WorkflowTemplatePublicationIssueDto) => void;
  onReloadLatest: () => void;
};

export function WorkflowTemplateCanvasView(props: Props): JSX.Element {
  const { t } = useLocalization();
  const { template } = props;
  const versionActions = useWorkflowCanvasVersionActions({
    business: props.business,
    template,
    versionId: props.versionId,
    copyName: t("workflowEditor.copyName", { name: template?.name ?? "" }),
  });
  const saving = props.saving || versionActions.loading;
  const inspectorVisible =
    props.preferences.inspector.open && Boolean(props.business);
  const detachedActionsVisible =
    Boolean(props.versionId) || (!props.readOnly && !inspectorVisible);
  const [pendingNode, setPendingNode] = useState<{
    type: WorkflowNodeType;
    position: WorkflowNodePosition;
  }>();
  const [quickMenu, setQuickMenu] = useState<{
    nodeId: string;
    position: { x: number; y: number };
  }>();
  const pendingStableKey =
    pendingNode && template
      ? createUniqueStableKey(
          template.currentVersion.nodes.map((node) => node.stableKey),
        )
      : "";

  function requestNode(
    type: WorkflowNodeType,
    position: WorkflowNodePosition,
  ): void {
    setPendingNode({ type, position });
  }

  return (
    <section className="workflow-canvas-page">
      <WorkspaceHeaderPortal>
        <PageHeader className="workflow-canvas-page-header">
          <IconButton
            size="compact"
            variant="ghost"
            className="icon-button"
            aria-label={t("workflowCanvas.back")}
            title={t("workflowCanvas.back")}
            onClick={props.onBack}
          >
            <ArrowLeft size={16} />
          </IconButton>
          <div className="workflow-canvas-page-title">
            <h1>{template?.name ?? t("workflowCanvas.title")}</h1>
            {template ? (
              <span>
                {t("workflowCanvas.version", {
                  version: template.currentVersion.version,
                })}
              </span>
            ) : null}
          </div>
          {props.readOnly && template ? (
            <Badge className="workflow-canvas-readonly" tone="neutral">
              {t("workflowCanvas.readOnly")}
            </Badge>
          ) : null}
          {template && !props.preferences.inspector.open ? (
            <IconButton
              size="compact"
              variant="ghost"
              className="icon-button workflow-canvas-open-inspector"
              aria-label={t("workflowCanvas.openInspector")}
              title={t("workflowCanvas.openInspector")}
              onClick={props.onOpenInspector}
            >
              <PanelRightOpen size={16} />
            </IconButton>
          ) : null}
        </PageHeader>
      </WorkspaceHeaderPortal>

      {props.loading ? (
        <div className="workflow-canvas-state" role="status">
          {t("common.loading")}
        </div>
      ) : props.loadError ? (
        <div className="workflow-canvas-state" role="alert">
          {props.loadError}
        </div>
      ) : template ? (
        <PageBody
          mode="workspace"
          className="workflow-canvas-shell"
          data-inspector-open={props.preferences.inspector.open}
          data-detached-actions={detachedActionsVisible}
          aria-label={t("workflowCanvas.ariaLabel", { name: template.name })}
        >
          <div
            className="workflow-canvas-workspace"
            data-inspector-open={props.preferences.inspector.open}
          >
            {template.currentVersion.nodes.length === 0 ? (
              <div className="workflow-canvas-empty">
                {props.readOnly ? (
                  <span>{t("workflowCanvas.emptyReadOnly")}</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => requestNode("ai_generate", { x: 0, y: 0 })}
                  >
                    <Plus size={16} />
                    {t("workflowCanvas.addNode")}
                  </button>
                )}
              </div>
            ) : (
              <ReactFlowProvider>
                <div className="workflow-canvas-surface">
                  <ReactFlow
                    nodes={props.nodes}
                    edges={props.edges}
                    nodeTypes={WORKFLOW_NODE_TYPES}
                    nodesDraggable={!props.readOnly}
                    nodesConnectable={!props.readOnly}
                    elementsSelectable
                    fitView={!props.preferences.viewport}
                    fitViewOptions={{ padding: 0.2, maxZoom: 1.2 }}
                    defaultViewport={props.preferences.viewport}
                    minZoom={0.1}
                    maxZoom={4}
                    proOptions={{ hideAttribution: true }}
                    onMoveEnd={(_event, viewport) =>
                      props.onViewportChange(viewport)
                    }
                    onNodesChange={props.onNodesChange}
                    onNodeDragStart={props.onNodeDragStart}
                    onNodeDragStop={(_event, node) =>
                      props.onNodeDragStop(node.id)
                    }
                    onConnect={props.onFlowConnect}
                    isValidConnection={(connection) =>
                      isWorkflowCanvasConnectionValid(connection, props.edges)
                    }
                    onNodeClick={(_event, node) => {
                      setQuickMenu(undefined);
                      props.onNodeSelect(node.id);
                    }}
                    onNodeContextMenu={(event, node) => {
                      event.preventDefault();
                      const bounds = event.currentTarget
                        .closest(".react-flow")
                        ?.getBoundingClientRect();
                      const position = {
                        x: event.clientX - (bounds?.left ?? 0),
                        y: event.clientY - (bounds?.top ?? 0),
                      };
                      setQuickMenu({
                        nodeId: node.id,
                        position: clampWorkflowQuickMenuPosition(
                          position,
                          {
                            width: bounds?.width ?? 0,
                            height: bounds?.height ?? 0,
                          },
                          window.innerWidth <= 1080 &&
                            props.preferences.inspector.open
                            ? 360
                            : 0,
                        ),
                      });
                    }}
                    onEdgeClick={(_event, edge) => props.onEdgeSelect(edge.id)}
                    onPaneClick={() => {
                      setQuickMenu(undefined);
                      props.onClearSelection();
                    }}
                  >
                    <WorkflowCanvasKeyboardShortcuts
                      readOnly={props.readOnly}
                      hasNodeSelection={Boolean(props.selectedNodeId)}
                      hasSelection={Boolean(
                        props.selectedNodeId || props.selectedEdgeId,
                      )}
                      onCopy={props.onCopy}
                      onDelete={
                        props.selectedEdgeId
                          ? props.onDeleteEdge
                          : props.onDeleteNode
                      }
                      onSelectAll={props.onSelectAll}
                    />
                    <Background
                      variant={BackgroundVariant.Dots}
                      gap={20}
                      size={1}
                    />
                    <WorkflowCanvasIssueFocus {...props.issueFocus} />
                    {props.preferences.minimapVisible ? (
                      <MiniMap pannable zoomable />
                    ) : null}
                    <WorkflowCanvasToolbar
                      readOnly={props.readOnly}
                      hasSelection={Boolean(
                        props.selectedNodeId || props.selectedEdgeId,
                      )}
                      canUndo={props.historyState.canUndo}
                      canRedo={props.historyState.canRedo}
                      onAdd={requestNode}
                      onCopy={props.onCopy}
                      onDelete={
                        props.selectedEdgeId
                          ? props.onDeleteEdge
                          : props.onDeleteNode
                      }
                      connectionTargets={
                        props.selectedNodeId
                          ? template.currentVersion.nodes
                              .filter(({ id }) => id !== props.selectedNodeId)
                              .map(({ id, name }) => ({ id, name }))
                          : []
                      }
                      onConnect={props.onConnect}
                      onAutoLayout={props.onAutoLayout}
                      onUndo={props.onUndo}
                      onRedo={props.onRedo}
                    />
                    {quickMenu ? (
                      <WorkflowNodeQuickMenu
                        {...quickMenu}
                        readOnly={props.readOnly}
                        edges={props.edges}
                        onCopy={props.onCopyNode}
                        onDelete={props.onDeleteNodeById}
                        onClose={() => setQuickMenu(undefined)}
                      />
                    ) : null}
                  </ReactFlow>
                </div>
              </ReactFlowProvider>
            )}
            {props.preferences.inspector.open && props.business ? (
              <WorkflowNodeInspector
                ref={props.inspectorRef}
                business={props.business}
                template={template}
                node={template.currentVersion.nodes.find(
                  ({ id }) => id === props.selectedNodeId,
                )}
                models={props.models}
                connectors={props.connectors}
                readOnly={props.readOnly}
                onConfigure={props.onConfigure}
                onChange={props.onTemplateChange}
                onUpdateNode={props.onUpdateNode}
                onUpdateTemplate={props.onUpdateTemplate}
                onDirtyChange={props.onInspectorDirtyChange}
                onClose={props.onCloseInspector}
                onPublish={props.onPublish}
                publishing={saving}
              />
            ) : null}
          </div>
          {detachedActionsVisible ? (
            <div className="workflow-canvas-detached-actions">
              {props.versionId ? (
                <div className="workflow-canvas-version-actions">
                  <Button
                    size="compact"
                    leadingIcon={<Copy size={14} />}
                    disabled={saving}
                    onClick={versionActions.copyVersion}
                  >
                    {t("workflowCanvas.copyVersion")}
                  </Button>
                  <Button
                    size="compact"
                    leadingIcon={<GitBranchPlus size={14} />}
                    disabled={saving}
                    onClick={versionActions.createNextVersion}
                  >
                    {t("workflowCanvas.createFromVersion")}
                  </Button>
                </div>
              ) : (
                <Button
                  size="compact"
                  variant="primary"
                  leadingIcon={<Rocket size={15} />}
                  className="workflow-canvas-publish"
                  onClick={props.onPublish}
                  disabled={saving}
                >
                  {t("workflowTemplates.action.publish")}
                </Button>
              )}
            </div>
          ) : null}
          <WorkflowPublicationIssues
            issues={props.publicationIssues}
            onSelect={props.onIssueSelect}
          />
          {saving ? (
            <span className="workflow-canvas-saving" role="status">
              {t("workflowCanvas.saving")}
            </span>
          ) : null}
          <WorkflowCanvasOperationError
            message={props.operationError}
            revisionConflict={props.revisionConflict}
            recoveryText={props.recoveryText}
            onReloadLatest={props.onReloadLatest}
          />
          {pendingNode ? (
            <WorkflowNodeCreateDialog
              type={pendingNode.type}
              initialName={t(`workflowEditor.type.${pendingNode.type}`)}
              initialStableKey={pendingStableKey}
              onCancel={() => setPendingNode(undefined)}
              onSubmit={(values) => {
                props.onAdd({ ...values, position: pendingNode.position });
                setPendingNode(undefined);
              }}
            />
          ) : null}
        </PageBody>
      ) : null}
    </section>
  );
}
