import { useRef, type RefObject } from "react";
import type { WorkflowNodePosition } from "../../../../domain/workflow";
import type { WorkflowTemplateDraftDto } from "../../../../shared/business";
import type { WorkflowCanvasNode } from "./workflow-canvas-model";

type PersistPositions = (
  positions: Array<{ nodeId: string; position: WorkflowNodePosition }>,
  previous: Array<{ nodeId: string; position: WorkflowNodePosition }>,
) => Promise<WorkflowTemplateDraftDto | undefined>;

export function useWorkflowCanvasDrag(
  nodesRef: RefObject<WorkflowCanvasNode[]>,
  persistPositions: PersistPositions,
) {
  const dragStartPositions = useRef<Map<string, WorkflowNodePosition>>(
    new Map(),
  );

  function captureDragStart(): void {
    dragStartPositions.current = new Map(
      (nodesRef.current ?? [])
        .filter((node) => node.selected)
        .map(({ id, position }) => [id, position]),
    );
  }

  function persistDrag(nodeId: string): void {
    const moved = (nodesRef.current ?? []).filter(
      (node) => node.id === nodeId || node.selected,
    );
    const previous = moved.map(({ id, position }) => ({
      nodeId: id,
      position: dragStartPositions.current.get(id) ?? position,
    }));
    const positions = moved.map(({ id, position }) => ({
      nodeId: id,
      position,
    }));
    if (
      positions.every(({ nodeId: id, position }) => {
        const before = dragStartPositions.current.get(id);
        return before?.x === position.x && before.y === position.y;
      })
    ) {
      return;
    }
    void persistPositions(positions, previous);
  }

  return { captureDragStart, persistDrag };
}
