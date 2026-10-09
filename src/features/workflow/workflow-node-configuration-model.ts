import type { ModelCapability } from "../../../domain/model";
import type { WorkflowNodeConfiguration } from "../../../domain/workflow";
import type { WorkflowTemplateNodeDto } from "../../../shared/business";
import type { TranslationKey } from "../../localization/translate";

export const workflowNodePermissions: Array<{
  capability: WorkflowNodeConfiguration["permissions"][number]["capability"];
  label: TranslationKey;
}> = [
  {
    capability: "filesystem.read",
    label: "settings.permission.capability.read",
  },
  {
    capability: "filesystem.write",
    label: "settings.permission.capability.write",
  },
  {
    capability: "process.execute",
    label: "settings.permission.capability.terminal",
  },
  {
    capability: "repository.modify",
    label: "settings.permission.capability.repository",
  },
];

export const workflowModelCapabilities: Array<{
  capability: ModelCapability;
  label: TranslationKey;
}> = [
  { capability: "text", label: "settings.editor.profile.capability.text" },
  { capability: "vision", label: "settings.editor.profile.capability.vision" },
  {
    capability: "toolCalling",
    label: "settings.editor.profile.capability.toolCalling",
  },
  {
    capability: "structuredOutput",
    label: "settings.editor.profile.capability.structuredOutput",
  },
];

export function initialWorkflowNodeConfiguration(
  node: WorkflowTemplateNodeDto,
): WorkflowNodeConfiguration {
  return structuredClone(workflowNodeConfigurationValue(node));
}

export function workflowNodeConfigurationValue(
  node: WorkflowTemplateNodeDto,
): WorkflowNodeConfiguration {
  if (node.configuration) {
    return {
      ...node.configuration,
      reasoning: node.configuration.reasoning ?? "inherit",
    };
  }
  return {
    input: {
      includeRequirementBody: true,
      predecessorArtifacts: "direct",
      includeSpaceKnowledge: false,
      attachments: [],
    },
    prompt: "",
    reasoning: "inherit",
    model: { strategy: "inherit" },
    connectorIds: [],
    permissions: [],
    artifact: {
      required: node.type === "ai_generate",
      relativePath:
        node.type === "ai_generate" ? `artifacts/${node.stableKey}.md` : "",
      kind: node.type === "ai_generate" ? "markdown" : "",
    },
    todos: [],
    completionGate: { requireApproval: node.type === "approval" },
    retry: { maxAttempts: 1, backoffMs: 0 },
    skip: { allowed: node.allowSkip, requireReason: false },
  };
}

export function splitConfigurationList(value: string): string[] {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}
