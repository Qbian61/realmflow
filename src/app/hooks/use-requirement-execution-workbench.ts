import { useCallback, useEffect, useRef, useState } from "react";
import type { RequirementExecutionViewDto } from "../../../shared/business";

export type RequirementExecutionWorkbenchController = {
  view: RequirementExecutionViewDto | undefined;
  selectedNodeId: string | undefined;
  loading: boolean;
  error: Error | undefined;
  select: (nodeId: string) => Promise<void>;
  reload: () => Promise<void>;
  afterDelete: (deletedNodeId: string) => Promise<void>;
  afterRollback: (targetNodeId: string) => Promise<void>;
};

export function useRequirementExecutionWorkbench(
  requirementId: string | undefined,
): RequirementExecutionWorkbenchController {
  const [view, setView] = useState<RequirementExecutionViewDto>();
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [loading, setLoading] = useState(Boolean(requirementId));
  const [error, setError] = useState<Error>();
  const requestSequence = useRef(0);
  const viewSnapshot = useRef<RequirementExecutionViewDto>();
  const selectedNodeSnapshot = useRef<string>();

  const load = useCallback(
    async (nodeId?: string): Promise<void> => {
      const getRequirementExecutionView =
        window.realmflow?.business?.getRequirementExecutionView;
      if (!requirementId || !getRequirementExecutionView) {
        setLoading(false);
        return;
      }

      const sequence = ++requestSequence.current;
      setLoading(true);
      setError(undefined);
      try {
        const nextView = await getRequirementExecutionView({
          requirementId,
          ...(nodeId ? { nodeId } : {}),
        });
        if (sequence !== requestSequence.current) return;

        viewSnapshot.current = nextView;
        selectedNodeSnapshot.current = nextView.selectedNode.id;
        setView(nextView);
        setSelectedNodeId(nextView.selectedNode.id);
      } catch (cause) {
        if (sequence !== requestSequence.current) return;
        setError(toError(cause));
      } finally {
        if (sequence === requestSequence.current) setLoading(false);
      }
    },
    [requirementId],
  );

  useEffect(() => {
    requestSequence.current += 1;
    viewSnapshot.current = undefined;
    selectedNodeSnapshot.current = undefined;
    setView(undefined);
    setSelectedNodeId(undefined);
    setError(undefined);
    setLoading(Boolean(requirementId));
    void load();

    return () => {
      requestSequence.current += 1;
    };
  }, [load, requirementId]);

  const select = useCallback(
    async (nodeId: string): Promise<void> => {
      await load(nodeId);
    },
    [load],
  );

  const reload = useCallback(async (): Promise<void> => {
    await load(selectedNodeSnapshot.current);
  }, [load]);

  const afterDelete = useCallback(
    async (deletedNodeId: string): Promise<void> => {
      const currentSelection = selectedNodeSnapshot.current;
      if (currentSelection && currentSelection !== deletedNodeId) {
        await load(currentSelection);
        return;
      }

      const orderedNodes = [...(viewSnapshot.current?.workflow.nodes ?? [])].sort(
        (left, right) =>
          left.order - right.order || left.id.localeCompare(right.id),
      );
      const deletedIndex = orderedNodes.findIndex(
        (node) => node.id === deletedNodeId,
      );
      const neighbor =
        deletedIndex < 0
          ? undefined
          : (orderedNodes[deletedIndex + 1]?.id ??
            orderedNodes[deletedIndex - 1]?.id);
      await load(neighbor);
    },
    [load],
  );

  const afterRollback = useCallback(
    async (targetNodeId: string): Promise<void> => {
      await load(targetNodeId);
    },
    [load],
  );

  const belongsToRoute =
    !view || view.workflow.requirementId === requirementId;

  return {
    view: belongsToRoute ? view : undefined,
    selectedNodeId: belongsToRoute ? selectedNodeId : undefined,
    loading: belongsToRoute ? loading : Boolean(requirementId),
    error: belongsToRoute ? error : undefined,
    select,
    reload,
    afterDelete,
    afterRollback,
  };
}

function toError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}
