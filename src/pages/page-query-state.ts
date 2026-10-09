import {
  createEnumQueryCodec,
  createTextQueryCodec,
} from "../navigation/url-query-state";

export type CapabilityFilters = {
  query: string;
  source: string;
  scope: string;
  status: string;
  risk: string;
};

export const spaceTabCodec = createEnumQueryCodec(
  ["overview", "resources"] as const,
  "overview",
);

export const workflowTemplateTabCodec = createEnumQueryCodec(
  ["published", "draft"] as const,
  "published",
);

export const scheduleTabCodec = createEnumQueryCodec(
  ["templates", "schedules"] as const,
  "templates",
);

export const capabilityTabCodec = createEnumQueryCodec(
  ["tools", "skills", "agents", "connectors"] as const,
  "tools",
);

export const capabilityQueryCodec = createTextQueryCodec();

export const capabilitySourceCodec = createEnumQueryCodec(
  ["all", "builtin", "local_upload", "manual", "generated", "mcp"] as const,
  "all",
);

export const capabilityScopeCodec = createEnumQueryCodec(
  ["all", "global", "work-root", "folder", "workspace", "requirement"] as const,
  "all",
);

export const capabilityStatusCodec = createEnumQueryCodec(
  ["all", "enabled", "disabled"] as const,
  "all",
);

export const capabilityRiskCodec = createEnumQueryCodec(
  ["all", "low", "medium", "high", "critical"] as const,
  "all",
);
