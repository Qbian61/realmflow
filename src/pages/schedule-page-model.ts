import type { ModelProfile, ModelProvider } from "../../domain/model";
import type { MissedRunPolicy } from "../../domain/schedule";

export type ModelPool = {
  providers: Array<ModelProvider & { revision: number }>;
  profiles: Array<ModelProfile & { revision: number }>;
};

export type ScheduleDraft = {
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
