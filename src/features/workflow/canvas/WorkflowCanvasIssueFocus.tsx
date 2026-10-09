import { useEffect } from "react";
import { useReactFlow } from "@xyflow/react";

type Props = {
  requestId: number;
  nodeIds: string[];
};

export function WorkflowCanvasIssueFocus({
  requestId,
  nodeIds,
}: Props): null {
  const { fitView } = useReactFlow();

  useEffect(() => {
    if (requestId === 0 || nodeIds.length === 0) return;
    void fitView({
      nodes: nodeIds.map((id) => ({ id })),
      duration: 200,
      maxZoom: 1.2,
      padding: 0.35,
    });
  }, [fitView, nodeIds, requestId]);

  return null;
}
