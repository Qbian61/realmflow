import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { RequirementWorkflow } from "../../../domain/workflow";
import type { WorkflowNodeExecutionDto } from "../../../shared/business";

type Input = {
  requirementId: string | undefined;
  activeNodeId: string;
  loadExecutionView: (nodeId?: string) => Promise<void>;
  setActiveNodeId: Dispatch<SetStateAction<string>>;
  setWorkflow: Dispatch<SetStateAction<RequirementWorkflow | undefined>>;
  setNodeExecution: Dispatch<
    SetStateAction<WorkflowNodeExecutionDto | undefined>
  >;
};

export function useRequirementWorkflowRefresh({
  requirementId,
  activeNodeId,
  loadExecutionView,
  setActiveNodeId,
  setWorkflow,
  setNodeExecution,
}: Input) {
  const refreshSelectedNodeState = useCallback(async (): Promise<void> => {
    const business = window.realmflow?.business;
    if (!business || !requirementId || !activeNodeId) return;
    if (typeof business.getRequirementExecutionView === "function") {
      await loadExecutionView(activeNodeId);
      return;
    }
    const [nextWorkflow, nextExecution] = await Promise.all([
      business.getRequirementWorkflow({ requirementId }),
      business.getWorkflowNodeExecution({
        requirementId,
        nodeId: activeNodeId,
      }),
    ]);
    if (nextWorkflow) setWorkflow(nextWorkflow);
    setNodeExecution(nextExecution);
  }, [
    activeNodeId,
    loadExecutionView,
    requirementId,
    setNodeExecution,
    setWorkflow,
  ]);

  const refreshAfterTemplateMigration = useCallback(
    async (migratedWorkflow: RequirementWorkflow): Promise<void> => {
      const business = window.realmflow?.business;
      const requestedNodeId =
        migratedWorkflow.nodes.find((node) => node.status === "ready")?.id ??
        migratedWorkflow.nodes[0]?.id;
      if (!business || !requirementId) return;
      if (typeof business.getRequirementExecutionView === "function") {
        await loadExecutionView(requestedNodeId);
        return;
      }
      const authoritativeWorkflow = await business.getRequirementWorkflow({
        requirementId,
      });
      if (!authoritativeWorkflow) return;
      const firstNodeId =
        authoritativeWorkflow.nodes.find((node) => node.status === "ready")
          ?.id ?? authoritativeWorkflow.nodes[0]?.id;
      setWorkflow(authoritativeWorkflow);
      if (firstNodeId) setActiveNodeId(firstNodeId);
      setNodeExecution(
        firstNodeId
          ? await business.getWorkflowNodeExecution({
              requirementId,
              nodeId: firstNodeId,
            })
          : undefined,
      );
    },
    [
      loadExecutionView,
      requirementId,
      setActiveNodeId,
      setNodeExecution,
      setWorkflow,
    ],
  );

  return { refreshSelectedNodeState, refreshAfterTemplateMigration };
}
