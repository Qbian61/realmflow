import type { AiRunStatus } from "../../../domain/ai-run";
import type {
  RequirementNode,
  RequirementWorkflow,
} from "../../../domain/workflow";
import type { RequirementStageId } from "../../domain/requirement";
import { isRequirementStageId } from "../../domain/requirement";
import type { Translator } from "../../localization/translate";

export function selectedWorkflowNodeId(
  workflow: RequirementWorkflow | undefined,
  activeStage: string,
): string | undefined {
  return workflow?.nodes.find((node) => node.id === activeStage)?.id;
}

export function runStatusLabel(status: AiRunStatus, t: Translator): string {
  return t(`workflowStatus.run.${status}`);
}

export function legacyStageFromNodeId(
  nodeId: string,
): RequirementStageId | undefined {
  const candidate = nodeId.slice(nodeId.lastIndexOf(":") + 1);
  return isRequirementStageId(candidate) ? candidate : undefined;
}

export function nodeStatusLabel(
  status: RequirementNode["status"],
  t: Translator,
): string {
  return t(`workflowStatus.node.${status}`);
}
