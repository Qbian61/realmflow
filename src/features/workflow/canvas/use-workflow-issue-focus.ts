import { useState, type RefObject } from "react";
import type {
  WorkflowTemplateDraftDto,
  WorkflowTemplatePublicationIssueDto,
} from "../../../../shared/business";

export function useWorkflowIssueFocus(
  templateRef: RefObject<WorkflowTemplateDraftDto | undefined>,
  requestNavigation: (action: () => void) => void,
  select: (nodeId?: string, edgeId?: string) => void,
) {
  const [focus, setFocus] = useState({
    requestId: 0,
    nodeIds: [] as string[],
  });

  function focusIssue(issue: WorkflowTemplatePublicationIssueDto): void {
    requestNavigation(() => {
      select(issue.nodeId, issue.edgeId);
      const edge = templateRef.current?.currentVersion.edges.find(
        ({ id }) => id === issue.edgeId,
      );
      setFocus((current) => ({
        requestId: current.requestId + 1,
        nodeIds: issue.nodeId
          ? [issue.nodeId]
          : edge
            ? [edge.sourceNodeId, edge.targetNodeId]
            : [],
      }));
    });
  }

  return { focus, focusIssue };
}
