import type {
  AddWorkflowTemplateNodeCommand,
  BusinessApi,
  WorkflowTemplateDraftDto,
  WorkflowTemplateNodeDto,
} from "../../../../shared/business";
import type { WorkflowEdge } from "../../../../domain/workflow";
import type { WorkflowNodePosition } from "../../../../domain/workflow";
import {
  copiedNodePosition,
  type CanvasHistoryCommand,
} from "./workflow-canvas-actions";

type MutationRunner = (
  operation: (
    current: WorkflowTemplateDraftDto,
  ) => Promise<WorkflowTemplateDraftDto>,
) => Promise<WorkflowTemplateDraftDto | undefined>;

export async function addNodeWithHistory(input: {
  business: BusinessApi;
  runMutation: MutationRunner;
  node: AddWorkflowTemplateNodeCommand["node"];
  record: (command: CanvasHistoryCommand) => void;
}): Promise<WorkflowTemplateDraftDto | undefined> {
  const execute = (latest: WorkflowTemplateDraftDto) =>
    input.business.addWorkflowTemplateNode({
      id: latest.id,
      expectedRevision: latest.revision,
      node: input.node,
    });
  const saved = await input.runMutation(execute);
  if (!saved) return undefined;
  input.record({
    undo: async () => {
      await requireMutation(
        input.runMutation((latest) => {
          const currentNode = latest.currentVersion.nodes.find(
            ({ stableKey }) => stableKey === input.node.stableKey,
          );
          return currentNode
            ? input.business.removeWorkflowTemplateNode({
                id: latest.id,
                expectedRevision: latest.revision,
                nodeId: currentNode.id,
              })
            : Promise.resolve(latest);
        }),
      );
    },
    redo: async () => {
      await requireMutation(input.runMutation(execute));
    },
  });
  return saved;
}

export async function copyNodeWithHistory(input: {
  business: BusinessApi;
  runMutation: MutationRunner;
  sourceStableKey: string;
  stableKey: string;
  name: string;
  sourcePosition: WorkflowNodePosition;
  record: (command: CanvasHistoryCommand) => void;
}): Promise<WorkflowTemplateDraftDto | undefined> {
  const execute = async (latest: WorkflowTemplateDraftDto) => {
    const source = latest.currentVersion.nodes.find(
      ({ stableKey }) => stableKey === input.sourceStableKey,
    );
    if (!source) return latest;
    const copied = await input.business.copyWorkflowTemplateNode({
      id: latest.id,
      expectedRevision: latest.revision,
      sourceNodeId: source.id,
      stableKey: input.stableKey,
      name: input.name,
    });
    const copiedNode = copied.currentVersion.nodes.find(
      ({ stableKey }) => stableKey === input.stableKey,
    );
    return copiedNode
      ? input.business.updateWorkflowTemplateNodePositions({
          id: copied.id,
          expectedRevision: copied.revision,
          positions: [
            {
              nodeId: copiedNode.id,
              position: copiedNodePosition(input.sourcePosition),
            },
          ],
        })
      : copied;
  };
  const saved = await input.runMutation(execute);
  if (!saved) return undefined;
  input.record({
    undo: async () => {
      await requireMutation(
        input.runMutation((latest) => {
          const copied = latest.currentVersion.nodes.find(
            ({ stableKey }) => stableKey === input.stableKey,
          );
          return copied
            ? input.business.removeWorkflowTemplateNode({
                id: latest.id,
                expectedRevision: latest.revision,
                nodeId: copied.id,
              })
            : Promise.resolve(latest);
        }),
      );
    },
    redo: async () => {
      await requireMutation(input.runMutation(execute));
    },
  });
  return saved;
}

export async function addEdgeWithHistory(input: {
  business: BusinessApi;
  runMutation: MutationRunner;
  sourceNodeId: string;
  targetNodeId: string;
  record: (command: CanvasHistoryCommand) => void;
}): Promise<WorkflowTemplateDraftDto | undefined> {
  const execute = (latest: WorkflowTemplateDraftDto) =>
    input.business.addWorkflowTemplateEdge({
      id: latest.id,
      expectedRevision: latest.revision,
      sourceNodeId: input.sourceNodeId,
      targetNodeId: input.targetNodeId,
    });
  const saved = await input.runMutation(execute);
  if (!saved) return undefined;
  input.record({
    undo: async () => {
      await requireMutation(
        input.runMutation((latest) => {
          const edge = findEdge(
            latest,
            input.sourceNodeId,
            input.targetNodeId,
          );
          return edge
            ? input.business.removeWorkflowTemplateEdge({
                id: latest.id,
                expectedRevision: latest.revision,
                edgeId: edge.id,
              })
            : Promise.resolve(latest);
        }),
      );
    },
    redo: async () => {
      await requireMutation(input.runMutation(execute));
    },
  });
  return saved;
}

export async function removeEdgeWithHistory(input: {
  business: BusinessApi;
  runMutation: MutationRunner;
  edgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
  record: (command: CanvasHistoryCommand) => void;
}): Promise<WorkflowTemplateDraftDto | undefined> {
  const remove = (latest: WorkflowTemplateDraftDto) => {
    const edge = findEdge(latest, input.sourceNodeId, input.targetNodeId);
    return edge
      ? input.business.removeWorkflowTemplateEdge({
          id: latest.id,
          expectedRevision: latest.revision,
          edgeId: edge.id,
        })
      : Promise.resolve(latest);
  };
  const saved = await input.runMutation((latest) =>
    input.business.removeWorkflowTemplateEdge({
      id: latest.id,
      expectedRevision: latest.revision,
      edgeId: input.edgeId,
    }),
  );
  if (!saved) return undefined;
  input.record({
    undo: async () => {
      await requireMutation(
        input.runMutation((latest) =>
          input.business.addWorkflowTemplateEdge({
            id: latest.id,
            expectedRevision: latest.revision,
            sourceNodeId: input.sourceNodeId,
            targetNodeId: input.targetNodeId,
          }),
        ),
      );
    },
    redo: async () => {
      await requireMutation(input.runMutation(remove));
    },
  });
  return saved;
}

export async function removeNodeWithHistory(input: {
  business: BusinessApi;
  runMutation: MutationRunner;
  node: WorkflowTemplateNodeDto;
  edges: WorkflowEdge[];
  record: (command: CanvasHistoryCommand) => void;
}): Promise<WorkflowTemplateDraftDto | undefined> {
  const remove = (latest: WorkflowTemplateDraftDto) => {
    const node = latest.currentVersion.nodes.find(
      ({ stableKey }) => stableKey === input.node.stableKey,
    );
    return node
      ? input.business.removeWorkflowTemplateNode({
          id: latest.id,
          expectedRevision: latest.revision,
          nodeId: node.id,
        })
      : Promise.resolve(latest);
  };
  const saved = await input.runMutation(remove);
  if (!saved) return undefined;
  input.record({
    undo: async () => {
      await requireMutation(
        input.runMutation((latest) =>
          input.business.restoreWorkflowTemplateNode({
            id: latest.id,
            expectedRevision: latest.revision,
            node: input.node,
            edges: input.edges,
          }),
        ),
      );
    },
    redo: async () => {
      await requireMutation(input.runMutation(remove));
    },
  });
  return saved;
}

function findEdge(
  template: WorkflowTemplateDraftDto,
  sourceNodeId: string,
  targetNodeId: string,
) {
  return template.currentVersion.edges.find(
    (edge) =>
      edge.sourceNodeId === sourceNodeId &&
      edge.targetNodeId === targetNodeId,
  );
}

async function requireMutation(
  mutation: Promise<WorkflowTemplateDraftDto | undefined>,
): Promise<WorkflowTemplateDraftDto> {
  const saved = await mutation;
  if (!saved) throw new Error("Workflow template mutation failed");
  return saved;
}
