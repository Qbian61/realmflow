import {
  applyNodeChanges,
  type Connection,
  type NodeChange,
  type Viewport
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { WorkflowTemplateDraftDto, WorkflowTemplatePublicationIssueDto } from '../../shared/business'
import type { WorkflowNodeConfiguration, WorkflowNodePosition, WorkflowNodeType } from '../../domain/workflow'
import { WorkflowTemplateCanvasView, type WorkflowCanvasNodeCreateInput } from '../features/workflow/canvas/WorkflowTemplateCanvasView'
import {
  DEFAULT_WORKFLOW_CANVAS_PREFERENCES,
  loadWorkflowCanvasPreferences,
  saveWorkflowCanvasPreferences,
  type WorkflowCanvasPreferences
} from '../features/workflow/canvas/workflow-canvas-preferences'
import {
  createSessionHistory,
  createSerializedMutationQueue,
  createUniqueStableKey,
  deletionImpact,
  invalidateSessionRedo,
  newNodePosition
} from '../features/workflow/canvas/workflow-canvas-actions'
import {
  addEdgeWithHistory,
  addNodeWithHistory,
  copyNodeWithHistory,
  removeEdgeWithHistory,
  removeNodeWithHistory
} from '../features/workflow/canvas/workflow-canvas-history'
import { useWorkflowCanvasNavigationGuard } from '../features/workflow/canvas/use-workflow-canvas-navigation-guard'
import { useWorkflowCanvasDrag } from '../features/workflow/canvas/use-workflow-canvas-drag'
import { useWorkflowCanvasCatalogs } from '../features/workflow/canvas/use-workflow-canvas-catalogs'
import { useWorkflowCanvasConflictRecovery } from '../features/workflow/canvas/use-workflow-canvas-conflict-recovery'
import { useWorkflowIssueFocus } from '../features/workflow/canvas/use-workflow-issue-focus'
import {
  applyWorkflowCanvasIssues,
  createWorkflowCanvasModel,
  layoutWorkflowNodes,
  type WorkflowCanvasNode
} from '../features/workflow/canvas/workflow-canvas-model'
import { WorkflowCanvasDeletionDialog, type WorkflowCanvasPendingDeletion } from '../features/workflow/canvas/WorkflowCanvasDeletionDialog'
import { useToast } from '../features/toast/ToastProvider'
import { useLocalization } from '../localization/LocalizationProvider'
export default function WorkflowTemplateCanvasPage(): JSX.Element {
  const { templateId, versionId } = useParams<{
    templateId: string
    versionId?: string
  }>()
  const { t } = useLocalization()
  const toast = useToast()
  const business = window.realmflow?.business
  const [template, setTemplate] = useState<WorkflowTemplateDraftDto>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [operationError, setOperationError] = useState('')
  const [selectedNodeId, setSelectedNodeId] = useState<string>()
  const [selectedEdgeId, setSelectedEdgeId] = useState<string>()
  const [pendingDeletion, setPendingDeletion] = useState<WorkflowCanvasPendingDeletion>()
  const [deletionError, setDeletionError] = useState('')
  const [canvasNodes, setCanvasNodes] = useState<WorkflowCanvasNode[]>([])
  const { models, connectors } = useWorkflowCanvasCatalogs(business)
  const [saving, setSaving] = useState(false)
  const [publicationIssues, setPublicationIssues] =
    useState<WorkflowTemplatePublicationIssueDto[]>([])
  const [preferences, setPreferences] = useState<WorkflowCanvasPreferences>(DEFAULT_WORKFLOW_CANVAS_PREFERENCES)
  const historyRef = useRef(createSessionHistory())
  const [historyState, setHistoryState] = useState(historyRef.current.snapshot())
  const templateRef = useRef<WorkflowTemplateDraftDto>()
  const nodesRef = useRef<WorkflowCanvasNode[]>([])
  const mutationQueue = useRef<
    ReturnType<typeof createSerializedMutationQueue<WorkflowTemplateDraftDto>>
  >()
  const refreshHistoryState = useCallback(() => {
    setHistoryState(historyRef.current.snapshot())
  }, [])
  const restoreCanvasSelection = useCallback(() => {
    setCanvasNodes((nodes) =>
      nodes.map((node) => ({ ...node, selected: node.id === selectedNodeId }))
    )
  }, [selectedNodeId])
  const navigationGuard = useWorkflowCanvasNavigationGuard(
    restoreCanvasSelection
  )
  const conflictRecovery = useWorkflowCanvasConflictRecovery(
    business,
    templateId,
    navigationGuard.inspectorRef,
    (loaded) => {
      historyRef.current.clear()
      refreshHistoryState()
      templateRef.current = loaded
      mutationQueue.current?.replace(loaded)
      setTemplate(loaded)
      setPublicationIssues([])
      setOperationError('')
    },
    (reason) =>
      setOperationError(
        reason instanceof Error ? reason.message : t('workflowTemplates.loadFailed')
      )
  )
  const issueNavigation = useWorkflowIssueFocus(
    templateRef,
    navigationGuard.request,
    (nodeId, edgeId) => {
      setSelectedNodeId(nodeId)
      setSelectedEdgeId(edgeId)
    }
  )
  useEffect(() => {
    let active = true
    if (!business || !templateId) {
      setError(t('workflowTemplates.unavailable'))
      setLoading(false)
      return () => {
        active = false
      }
    }
    setLoading(true)
    setError('')
    const request = versionId
      ? business.getWorkflowTemplateVersion({ templateId, versionId })
      : business.getWorkflowTemplateDraft({ templateId })
    void request
      .then((loaded) => {
        if (active) {
          historyRef.current.clear()
          refreshHistoryState()
          templateRef.current = loaded
          mutationQueue.current =
            createSerializedMutationQueue<WorkflowTemplateDraftDto>(loaded)
          setPreferences(
            loadWorkflowCanvasPreferences(loaded.currentVersion.id)
          )
          setTemplate(loaded)
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(
            reason instanceof Error
              ? reason.message
              : t('workflowTemplates.loadFailed')
          )
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [business, refreshHistoryState, t, templateId, versionId])
  const readOnly = Boolean(versionId) || template?.status !== 'draft'
  const model = useMemo(
    () =>
      template
        ? applyWorkflowCanvasIssues(
            createWorkflowCanvasModel(template),
            publicationIssues,
            t('workflowCanvas.publicationIssue')
          )
        : undefined,
    [publicationIssues, t, template]
  )
  const canvasEdges = useMemo(
    () =>
      model?.edges.map((edge) => ({
        ...edge,
        selected: edge.id === selectedEdgeId
      })) ?? [],
    [model, selectedEdgeId]
  )

  useEffect(() => {
    if (!model) return
    setCanvasNodes(
      model.nodes.map((node) => ({
        ...node,
        data: { ...node.data, readOnly },
        selected: node.id === selectedNodeId
      }))
    )
  }, [model, readOnly, selectedNodeId])
useEffect(() => {
    nodesRef.current = canvasNodes
  }, [canvasNodes])
  const runMutation = useCallback(
    (
      operation: (
        current: WorkflowTemplateDraftDto
      ) => Promise<WorkflowTemplateDraftDto>,
      rollback?: () => void
    ): Promise<WorkflowTemplateDraftDto | undefined> => {
      const queue = mutationQueue.current
      if (!queue) return Promise.resolve(undefined)
      setSaving(true)
      setOperationError('')
      return queue
        .run(operation)
        .then((saved) => {
          templateRef.current = saved
          setTemplate(saved)
          setPublicationIssues([])
          conflictRecovery.clearConflict()
          return saved
        })
        .catch((reason: unknown) => {
          rollback?.()
          if (
            reason instanceof Error &&
            reason.message.toLowerCase().includes('revision')
          ) {
            historyRef.current.clear()
            refreshHistoryState()
            conflictRecovery.markConflict()
            setOperationError(t('workflowCanvas.saveFailed'))
          }
          toast.error('workflowCanvas.saveFailed')
          return undefined
        })
        .finally(() => setSaving(false))
    },
    [business, conflictRecovery, refreshHistoryState, t, toast]
  )

  function persistPositions(
    positions: Array<{ nodeId: string; position: WorkflowNodePosition }>,
    previous: Array<{ nodeId: string; position: WorkflowNodePosition }>,
    recordHistory = true
  ): Promise<WorkflowTemplateDraftDto | undefined> {
    if (!business) return Promise.resolve(undefined)
    return runMutation(
      (current) =>
        business.updateWorkflowTemplateNodePositions({
          id: current.id,
          expectedRevision: current.revision,
          positions
        }),
      () => {
        const rollback = new Map(
          previous.map(({ nodeId, position }) => [nodeId, position])
        )
        setCanvasNodes((current) =>
          current.map((node) => ({
            ...node,
            position: rollback.get(node.id) ?? node.position
          }))
        )
      }
    ).then((saved) => {
      if (saved && recordHistory) {
        historyRef.current.record({
          undo: async () => {
            await persistPositions(previous, positions, false)
          },
          redo: async () => {
            await persistPositions(positions, previous, false)
          }
        })
        refreshHistoryState()
      }
      return saved
    })
  }
  const canvasDrag = useWorkflowCanvasDrag(nodesRef, persistPositions)

  function handleAdd(input: WorkflowCanvasNodeCreateInput): void {
    if (!business || readOnly) return
    const current = templateRef.current
    if (!current) return
    const selectedPosition = nodesRef.current.find(
      ({ id }) => id === selectedNodeId
    )?.position
    const position = selectedPosition
      ? newNodePosition(selectedPosition)
      : input.position
    const node = {
      stableKey: input.stableKey,
      type: input.type,
      name: input.name,
      description: '',
      allowSkip: false,
      position
    }
    void addNodeWithHistory({
      business,
      runMutation,
      node,
      record: (command) => historyRef.current.record(command)
    }).then((saved) => {
      const added = saved?.currentVersion.nodes.find(
        (node) => node.stableKey === input.stableKey
      )
      if (!added) return
      setSelectedNodeId(added.id)
      refreshHistoryState()
    })
  }
  function handleCopy(nodeId = selectedNodeId): void {
    if (!business || !nodeId || readOnly) return
    const current = templateRef.current
    const source = current?.currentVersion.nodes.find(
      ({ id }) => id === nodeId
    )
    const sourcePosition = nodesRef.current.find(
      ({ id }) => id === nodeId
    )?.position
    if (!current || !source || !sourcePosition) return
    const stableKey = createUniqueStableKey(
      current.currentVersion.nodes.map((node) => node.stableKey),
      `${source.stableKey}-copy`
    )
    void copyNodeWithHistory({
      business,
      runMutation,
      sourceStableKey: source.stableKey,
      stableKey,
      name: t('workflowEditor.copyName', { name: source.name }),
      sourcePosition,
      record: (command) => historyRef.current.record(command)
    }).then((saved) => {
      const copied = saved?.currentVersion.nodes.find(
        (node) => node.stableKey === stableKey
      )
      if (!copied) return
      setSelectedNodeId(copied.id)
      refreshHistoryState()
    })
  }

  function handleDelete(nodeId = selectedNodeId): void {
    if (!business || !nodeId || readOnly) return
    const current = templateRef.current
    const node = current?.currentVersion.nodes.find(
      ({ id }) => id === nodeId
    )
    if (!current || !node) return
    const impact = deletionImpact(current, node.id)
    const edges = current.currentVersion.edges.filter(
      (edge) =>
        edge.sourceNodeId === node.id || edge.targetNodeId === node.id
    )
    setDeletionError('')
    setPendingDeletion({
      kind: 'node',
      node,
      edges,
      description: t('workflowCanvas.deleteConfirm', {
        name: node.name,
        incoming: impact.incoming,
        outgoing: impact.outgoing
      })
    })
  }

  function handleConnect(targetNodeId: string): void {
    if (!selectedNodeId) return
    handleConnectFrom(selectedNodeId, targetNodeId)
  }
  function handleFlowConnect(connection: Connection): void {
    if (!connection.source || !connection.target) return
    const sourceNodeId = connection.source
    setSelectedNodeId(sourceNodeId)
    handleConnectFrom(sourceNodeId, connection.target)
  }
  function handleConnectFrom(sourceNodeId: string, targetNodeId: string): void {
    if (!business || readOnly) return
    void addEdgeWithHistory({
      business,
      runMutation,
      sourceNodeId,
      targetNodeId,
      record: (command) => historyRef.current.record(command)
    }).then((saved) => {
      if (!saved) return
      refreshHistoryState()
    })
  }

  function handleDeleteEdge(): void {
    if (!business || !selectedEdgeId || readOnly) return
    const edge = templateRef.current?.currentVersion.edges.find(
      ({ id }) => id === selectedEdgeId
    )
    if (!edge) return
    const nodesById = new Map(
      templateRef.current?.currentVersion.nodes.map((node) => [node.id, node])
    )
    setDeletionError('')
    setPendingDeletion({
      kind: 'edge',
      edge,
      description: t('workflowCanvas.deleteEdgeConfirm', {
        source: nodesById.get(edge.sourceNodeId)?.name ?? edge.sourceNodeId,
        target: nodesById.get(edge.targetNodeId)?.name ?? edge.targetNodeId
      })
    })
  }

  async function confirmDeletion(): Promise<void> {
    if (!business || !pendingDeletion) return
    setDeletionError('')
    const saved =
      pendingDeletion.kind === 'node'
        ? await removeNodeWithHistory({
            business,
            runMutation,
            node: pendingDeletion.node,
            edges: pendingDeletion.edges,
            record: (command) => historyRef.current.record(command)
          })
        : await removeEdgeWithHistory({
            business,
            runMutation,
            edgeId: pendingDeletion.edge.id,
            sourceNodeId: pendingDeletion.edge.sourceNodeId,
            targetNodeId: pendingDeletion.edge.targetNodeId,
            record: (command) => historyRef.current.record(command)
          })
    if (!saved) {
      setDeletionError(t('workflowCanvas.saveFailed'))
      return
    }
    if (pendingDeletion.kind === 'node') setSelectedNodeId(undefined)
    else setSelectedEdgeId(undefined)
    setPendingDeletion(undefined)
    refreshHistoryState()
  }

  function handleAutoLayout(): void {
    const current = templateRef.current
    if (!current || readOnly) return
    const renderedPositions = new Map(
      nodesRef.current.map(({ id, position }) => [id, position])
    )
    const fallbackPositions = new Map(
      createWorkflowCanvasModel(current).nodes.map(({ id, position }) => [
        id,
        position
      ])
    )
    const previous = current.currentVersion.nodes.map(({ id }) => ({
      nodeId: id,
      position: renderedPositions.get(id) ?? fallbackPositions.get(id)!
    }))
    const nodesWithoutPositions = current.currentVersion.nodes.map(
      ({ position: _position, ...node }) => node
    )
    const layout = layoutWorkflowNodes(
      nodesWithoutPositions,
      current.currentVersion.edges
    )
    const positions = current.currentVersion.nodes.map(({ id }) => ({
      nodeId: id,
      position: layout[id]
    }))
    setCanvasNodes((nodes) =>
      nodes.map((node) => ({ ...node, position: layout[node.id] }))
    )
    void persistPositions(positions, previous)
  }

  async function handleConfigure(
    nodeId: string,
    configuration: WorkflowNodeConfiguration
  ): Promise<boolean> {
    if (!business || readOnly) return false
    const saved = await runMutation((latest) =>
      business.configureWorkflowTemplateNode({
        id: latest.id,
        expectedRevision: latest.revision,
        nodeId,
        configuration
      })
    )
    if (saved) invalidateSessionRedo(historyRef.current, refreshHistoryState)
    return Boolean(saved)
  }

  function handlePublish(): void {
    const queue = mutationQueue.current
    if (!business || !queue || readOnly) return
    setSaving(true)
    setOperationError('')
    void queue
      .run(async (current) => {
        const result = await business.publishWorkflowTemplate({
          id: current.id,
          expectedRevision: current.revision
        })
        if ('outcome' in result) {
          setPublicationIssues(result.validation.issues)
          return current
        }
        const published: WorkflowTemplateDraftDto = {
          ...current,
          ...result,
          currentVersion: {
            ...current.currentVersion,
            ...result.currentVersion
          }
        }
        templateRef.current = published
        setTemplate(published)
        setPublicationIssues([])
        return published
      })
      .catch(() => {
        toast.error('workflowTemplates.transitionFailed', {
          values: { action: t('workflowTemplates.action.publish') }
        })
      })
      .finally(() => setSaving(false))
  }

  function updatePreferences(
    update: (current: WorkflowCanvasPreferences) => WorkflowCanvasPreferences
  ): void {
    setPreferences((current) => {
      const next = update(current)
      if (templateRef.current) {
        saveWorkflowCanvasPreferences(
          templateRef.current.currentVersion.id,
          next
        )
      }
      return next
    })
  }

  function handleViewportChange(viewport: Viewport): void {
    updatePreferences((current) => ({ ...current, viewport }))
  }

  function setInspectorOpen(open: boolean): void {
    updatePreferences((current) => ({
      ...current,
      inspector: { ...current.inspector, open }
    }))
  }

  function handleNodeChanges(changes: NodeChange<WorkflowCanvasNode>[]): void {
    setCanvasNodes((current) => applyNodeChanges(changes, current))
  }

  function handleUndo(): void {
    void historyRef.current
      .undo()
      .then(refreshHistoryState)
      .catch(() => undefined)
  }
  function handleRedo(): void {
    void historyRef.current
      .redo()
      .then(refreshHistoryState)
      .catch(() => undefined)
  }
  return (
    <>
      <WorkflowTemplateCanvasView
      business={business}
      template={template}
      loading={loading}
      loadError={error}
      operationError={operationError}
      revisionConflict={conflictRecovery.revisionConflict}
      recoveryText={conflictRecovery.recoveryText}
      saving={saving || conflictRecovery.loading}
      readOnly={readOnly}
      versionId={versionId}
      preferences={preferences}
      models={models}
      connectors={connectors}
      nodes={canvasNodes}
      edges={canvasEdges}
      selectedNodeId={selectedNodeId}
      selectedEdgeId={selectedEdgeId}
      historyState={historyState}
      publicationIssues={publicationIssues}
      inspectorRef={navigationGuard.inspectorRef}
      issueFocus={issueNavigation.focus}
      onAdd={(input) => navigationGuard.request(() => handleAdd(input))}
      onCopy={() => navigationGuard.request(handleCopy)}
      onCopyNode={(nodeId) => navigationGuard.request(() => handleCopy(nodeId))}
      onDeleteNode={() => navigationGuard.request(handleDelete)}
      onDeleteNodeById={(nodeId) => navigationGuard.request(() => handleDelete(nodeId))}
      onDeleteEdge={handleDeleteEdge}
      onConnect={handleConnect}
      onFlowConnect={handleFlowConnect}
      onAutoLayout={handleAutoLayout}
      onUndo={handleUndo}
      onRedo={handleRedo}
      onSelectAll={() => {
        setSelectedEdgeId(undefined)
        setCanvasNodes((nodes) =>
          nodes.map((node) => ({ ...node, selected: true }))
        )
      }}
      onViewportChange={handleViewportChange}
      onNodesChange={handleNodeChanges}
      onNodeDragStart={canvasDrag.captureDragStart}
      onNodeDragStop={canvasDrag.persistDrag}
      onNodeSelect={(nodeId) =>
        navigationGuard.request(() => {
          setSelectedEdgeId(undefined)
          setSelectedNodeId(nodeId)
          updatePreferences((current) => ({
            ...current,
            inspector: { ...current.inspector, open: true }
          }))
        })
      }
      onEdgeSelect={(edgeId) => {
        navigationGuard.request(() => {
          setSelectedNodeId(undefined)
          setSelectedEdgeId(edgeId)
        })
      }}
      onClearSelection={() =>
        navigationGuard.request(() => {
          setSelectedNodeId(undefined)
          setSelectedEdgeId(undefined)
        })
      }
      onPublish={() => navigationGuard.request(handlePublish)}
      onBack={() =>
        navigationGuard.request(() => {
          window.location.hash = '/workflows'
        })
      }
      onOpenInspector={() => setInspectorOpen(true)}
      onCloseInspector={() =>
        navigationGuard.request(() => setInspectorOpen(false))
      }
      onConfigure={handleConfigure}
      onUpdateNode={async (input) => {
        if (!business || readOnly) return false
        const saved = await runMutation((latest) =>
          business.updateWorkflowTemplateNode({
            id: latest.id,
            expectedRevision: latest.revision,
            ...input
          })
        )
        if (saved)
          invalidateSessionRedo(historyRef.current, refreshHistoryState)
        return Boolean(saved)
      }}
      onUpdateTemplate={async (input) => {
        if (!business || readOnly) return false
        const saved = await runMutation(async (latest) => {
          const summary = await business.updateWorkflowTemplate({
            id: latest.id,
            expectedRevision: latest.revision,
            ...input
          })
          return {
            ...latest,
            ...summary,
            currentVersion: {
              ...latest.currentVersion,
              ...summary.currentVersion
            }
          }
        })
        if (saved)
          invalidateSessionRedo(historyRef.current, refreshHistoryState)
        return Boolean(saved)
      }}
      onInspectorDirtyChange={navigationGuard.setDirty}
      onTemplateChange={(saved) => {
        templateRef.current = saved
        mutationQueue.current?.replace(saved)
        setTemplate(saved)
      }}
      onIssueSelect={issueNavigation.focusIssue}
        onReloadLatest={conflictRecovery.reloadLatest}
      />
      <WorkflowCanvasDeletionDialog
        kind={pendingDeletion?.kind}
        description={pendingDeletion?.description ?? ''}
        pending={saving}
        error={deletionError}
        onCancel={() => {
          setPendingDeletion(undefined)
          setDeletionError('')
        }}
        onConfirm={confirmDeletion}
      />
    </>
  )
}
