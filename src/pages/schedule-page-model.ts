import type { ModelProfile, ModelProvider } from "../../domain/model";
import type { MissedRunPolicy } from "../../domain/schedule";
import type { ApprovalProfileId } from "../../domain/approval-profile";
import type { ConnectorDto } from "../../shared/business";

export type ModelPool = {
  providers: Array<ModelProvider & { revision: number }>;
  profiles: Array<ModelProfile & { revision: number }>;
};

export function enabledScheduleModels(models: ModelPool): ModelPool['profiles'] {
  const providers = new Set(models.providers.filter(provider => provider.enabled).map(provider => provider.id))
  return models.profiles.filter(profile => profile.enabled && providers.has(profile.providerId))
}

export function availableScheduleConnectors(connectors: ConnectorDto[]): ConnectorDto[] {
  return connectors.filter(({ connector }) => connector.enabled && connector.validation?.status === 'available')
}

export type ScheduleDraft = {
  approvalProfileId: ApprovalProfileId;
  id?: string;
  expectedRevision?: number;
  name: string;
  description: string;
  cronExpression: string;
  timeZone: string;
  missedRunPolicy: MissedRunPolicy;
  workspaceId: string;
  modelProfileId: string;
  skillVersionId: string;
  skillInputText: string;
  connectorIds: Record<string, string>;
};

export const scheduleRecommendations = [
  {
    id: "weekly-report",
    cronExpression: "0 18 * * 5",
  },
  {
    id: "daily-briefing",
    cronExpression: "0 8 * * 1-5",
  },
  {
    id: "risk-review",
    cronExpression: "0 10 * * 1",
  },
] as const;

export function createScheduleCommandId(prefix: string): string {
  return `${prefix}:${crypto.randomUUID()}`;
}
