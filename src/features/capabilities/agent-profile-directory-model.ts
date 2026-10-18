import type {
  CapabilityDefinition,
  CapabilityInstallation,
} from "../../../domain/capability";
import type {
  AgentRunBudget,
  AgentRunScenarioId,
} from "../../../domain/agent-runtime";
import type { CapabilityCatalogSnapshotDto } from "../../../shared/capability-catalog";
import type { LocalizedCapabilityDisplay } from "../../../shared/capability-localization";
import type { ToolCatalogDto } from "../../../shared/tool-catalog";
import type {
  TranslationKey,
  Translator,
} from "../../localization/translate";
import {
  buildProductCapabilityItems,
  type ProductCapabilityItem,
} from "./product-capability-directory-model";
import {
  BUILTIN_AGENT_PROFILES,
  CAPABILITY_RULES,
  OUTPUT_CONTRACT,
  PRODUCT_DESCRIPTION_KEYS,
  PRODUCT_NAME_KEYS,
  SCENE_LABEL_KEYS,
  SKILL_DESCRIPTION_KEYS,
  SKILL_NAME_KEYS,
  SYSTEM_INVARIANTS,
  type BuiltinAgentProfileBlueprint,
  type ProductFamily,
  type SkillFamily,
} from "./agent-profile-blueprints";

const AGENT_RUN_SCENARIO_IDS: readonly AgentRunScenarioId[] = [
  "general",
  "folder",
  "space",
  "requirement-node",
  "workflow-node",
  "scheduled",
  "sensitive",
  "management",
];

export const AGENT_PROFILE_SCENES = [
  "all",
  ...AGENT_RUN_SCENARIO_IDS,
] as const;

export type AgentProfileScene = (typeof AGENT_PROFILE_SCENES)[number];

export type AgentProfileReference = {
  id: string;
  name: string;
  description: string;
  available: boolean;
};

export type AgentProfilePromptSection = {
  title: string;
  lines: string[];
};

export type AgentProfilePortrait = {
  key: string;
  id: string;
  name: string;
  description: string;
  role: string;
  avatar: string;
  scenarios: AgentRunScenarioId[];
  sceneLabels: string[];
  tags: string[];
  promptSections: AgentProfilePromptSection[];
  tools: AgentProfileReference[];
  skills: AgentProfileReference[];
  modelCapabilities: string[];
  reasoningModes: string[];
  maximumRisk: string;
  budgets: AgentRunBudget;
  sourceLabel: string;
  searchText: string;
  installed?: {
    definition: CapabilityDefinition;
    installation: CapabilityInstallation;
    versions: CapabilityDefinition[];
    display?: LocalizedCapabilityDisplay;
  };
};

export function buildAgentProfilePortraits(input: {
  catalog: ToolCatalogDto;
  capabilities: CapabilityCatalogSnapshotDto;
  t: Translator;
}): AgentProfilePortrait[] {
  const toolItems = buildProductCapabilityItems({
    kind: "tool",
    catalog: input.catalog,
    capabilities: input.capabilities,
  });
  const skillItems = buildProductCapabilityItems({
    kind: "skill",
    catalog: input.catalog,
    capabilities: input.capabilities,
  });
  const productByFamily = indexProductCapabilities(toolItems);
  const skillByFamily = indexSkillCapabilities(skillItems);
  const builtin = BUILTIN_AGENT_PROFILES.map((profile) =>
    fromBuiltinProfile(profile, {
      t: input.t,
      productByFamily,
      skillByFamily,
    }),
  );
  return [
    ...builtin,
    ...buildInstalledAgentProfiles(input.capabilities, input.t),
  ];
}

export function filterAgentProfilePortraits(
  profiles: readonly AgentProfilePortrait[],
  filters: { scene: AgentProfileScene; query: string },
): AgentProfilePortrait[] {
  const query = normalize(filters.query);
  return profiles.filter((profile) => {
    if (
      filters.scene !== "all" &&
      !profile.scenarios.includes(filters.scene)
    ) {
      return false;
    }
    return !query || normalize(profile.searchText).includes(query);
  });
}

export function agentProfileSceneLabel(
  scene: AgentProfileScene,
  t: Translator,
): string {
  return scene === "all"
    ? t("capabilities.agentDirectory.scene.all")
    : t(SCENE_LABEL_KEYS[scene]);
}

function fromBuiltinProfile(
  profile: BuiltinAgentProfileBlueprint,
  context: {
    t: Translator;
    productByFamily: Map<ProductFamily, ProductCapabilityItem>;
    skillByFamily: Map<SkillFamily, ProductCapabilityItem>;
  },
): AgentProfilePortrait {
  const tools = profile.toolFamilies.map((family) =>
    referenceFromProductFamily(family, context.productByFamily, context.t),
  );
  const skills = profile.skillFamilies.map((family) =>
    referenceFromSkillFamily(family, context.skillByFamily, context.t),
  );
  return finalizePortrait({
    key: profile.id,
    id: profile.id,
    name: context.t(profile.nameKey),
    description: context.t(profile.descriptionKey),
    role: context.t(profile.roleKey),
    avatar: profile.avatar,
    scenarios: profile.scenarios,
    sceneLabels: profile.scenarios.map((scene) =>
      agentProfileSceneLabel(scene, context.t),
    ),
    tags: profile.tags.map((key) => context.t(key)),
    promptSections: [
      {
        title: context.t("capabilities.agentDirectory.prompt.invariants"),
        lines: SYSTEM_INVARIANTS,
      },
      {
        title: context.t("capabilities.agentDirectory.prompt.responsibilities"),
        lines: [profile.runtimeRole],
      },
      {
        title: context.t("capabilities.agentDirectory.prompt.capabilityRules"),
        lines: CAPABILITY_RULES,
      },
      {
        title: context.t("capabilities.agentDirectory.prompt.outputContract"),
        lines: OUTPUT_CONTRACT,
      },
    ],
    tools,
    skills,
    modelCapabilities: ["text", "toolCalling"],
    reasoningModes:
      profile.id === "builtin.sensitive"
        ? ["off", "low", "medium"]
        : ["off", "low", "medium", "high"],
    maximumRisk: profile.maximumRisk,
    budgets: profile.budgets,
    sourceLabel: context.t("capabilities.agentDirectory.source.builtin"),
  });
}

function buildInstalledAgentProfiles(
  capabilities: CapabilityCatalogSnapshotDto,
  t: Translator,
): AgentProfilePortrait[] {
  return capabilities.installations
    .flatMap((installation) => {
      const definition = capabilities.definitions.find(
        (candidate) =>
          candidate.kind === "agent" &&
          candidate.id === installation.capabilityId &&
          candidate.version === installation.capabilityVersion,
      );
      if (!definition) return [];
      const display =
        capabilities.displayByDefinitionKey?.[
          `${definition.id}@${definition.version}`
        ];
      const versions = capabilities.definitions
        .filter(
          (candidate) =>
            candidate.kind === "agent" &&
            candidate.id === installation.capabilityId,
        )
        .sort((left, right) => compareVersions(right.version, left.version));
      return [
        finalizePortrait({
          key: `installed:${installation.id}`,
          id: definition.id,
          name: display?.name ?? definition.name,
          description: display?.description ?? definition.description,
          role:
            display?.description ||
            definition.description ||
            t("capabilities.agentDirectory.installed.role"),
          avatar: initials(display?.name ?? definition.name),
          scenarios: ["general"],
          sceneLabels: [agentProfileSceneLabel("general", t)],
          tags: [
            sourceLabel(definition.source, t),
            statusLabel(installation.status, t),
            t(`capabilities.risk.${definition.permissions.maximumRisk}`),
          ],
          promptSections: [
            {
              title: t("capabilities.agentDirectory.prompt.runtimeDefinition"),
              lines: [
                `Prompt path: ${definition.runtime.kind === "agent" ? definition.runtime.promptPath : "-"}`,
                `Model capabilities: ${
                  definition.runtime.kind === "agent"
                    ? definition.runtime.modelCapabilities.join(", ") || "-"
                    : "-"
                }`,
                `Reasoning modes: ${
                  definition.runtime.kind === "agent"
                    ? definition.runtime.reasoningModes.join(", ") || "-"
                    : "-"
                }`,
              ],
            },
          ],
          tools: installedToolReferences(definition, installation, t),
          skills: installedSkillReferences(definition, t),
          modelCapabilities:
            definition.runtime.kind === "agent"
              ? definition.runtime.modelCapabilities
              : [],
          reasoningModes:
            definition.runtime.kind === "agent"
              ? definition.runtime.reasoningModes
              : [],
          maximumRisk: definition.permissions.maximumRisk,
          budgets: {
            maxToolCalls: 0,
            maxSubagents:
              definition.runtime.kind === "agent" &&
              definition.runtime.delegation.allowed
                ? definition.runtime.delegation.maximumDepth
                : 0,
            timeoutMs: 0,
            maxRetries: 0,
          },
          sourceLabel: sourceLabel(definition.source, t),
          installed: {
            definition,
            installation,
            versions,
            ...(display ? { display } : {}),
          },
        }),
      ];
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

function finalizePortrait(
  portrait: Omit<AgentProfilePortrait, "sceneLabels" | "searchText"> & {
    sceneLabels?: string[];
  },
): AgentProfilePortrait {
  const sceneLabels =
    portrait.sceneLabels ??
    portrait.scenarios.map((scene) =>
      agentProfileSceneLabel(scene, fallbackTranslator),
    );
  const searchText = [
    portrait.id,
    portrait.name,
    portrait.description,
    portrait.role,
    portrait.sourceLabel,
    portrait.maximumRisk,
    ...sceneLabels,
    ...portrait.tags,
    ...portrait.modelCapabilities,
    ...portrait.reasoningModes,
    ...portrait.promptSections.flatMap(({ title, lines }) => [title, ...lines]),
  ].join(" ");
  return {
    ...portrait,
    sceneLabels,
    searchText,
  };
}

function indexProductCapabilities(
  items: ProductCapabilityItem[],
): Map<ProductFamily, ProductCapabilityItem> {
  const byFamily = new Map<ProductFamily, ProductCapabilityItem>();
  for (const item of items) {
    if (item.productFamily && !byFamily.has(item.productFamily)) {
      byFamily.set(item.productFamily, item);
    }
  }
  return byFamily;
}

function indexSkillCapabilities(
  items: ProductCapabilityItem[],
): Map<SkillFamily, ProductCapabilityItem> {
  const byFamily = new Map<SkillFamily, ProductCapabilityItem>();
  for (const item of items) {
    if (item.skillFamily && !byFamily.has(item.skillFamily)) {
      byFamily.set(item.skillFamily, item);
    }
  }
  return byFamily;
}

function referenceFromProductFamily(
  family: ProductFamily,
  items: Map<ProductFamily, ProductCapabilityItem>,
  t: Translator,
): AgentProfileReference {
  const item = items.get(family);
  return {
    id: item?.id ?? family,
    name: item ? capabilityItemName(item, t) : t(PRODUCT_NAME_KEYS[family]),
    description: item
      ? capabilityItemDescription(item, t)
      : t(PRODUCT_DESCRIPTION_KEYS[family]),
    available: item?.enabled ?? false,
  };
}

function referenceFromSkillFamily(
  family: SkillFamily,
  items: Map<SkillFamily, ProductCapabilityItem>,
  t: Translator,
): AgentProfileReference {
  const item = items.get(family);
  return {
    id: item?.id ?? family,
    name: item ? capabilityItemName(item, t) : t(SKILL_NAME_KEYS[family]),
    description: item
      ? capabilityItemDescription(item, t)
      : t(SKILL_DESCRIPTION_KEYS[family]),
    available: item?.enabled ?? false,
  };
}

function capabilityItemName(
  item: ProductCapabilityItem,
  t: Translator,
): string {
  if (item.productFamily) return t(PRODUCT_NAME_KEYS[item.productFamily]);
  if (item.skillFamily) return t(SKILL_NAME_KEYS[item.skillFamily]);
  return item.name;
}

function capabilityItemDescription(
  item: ProductCapabilityItem,
  t: Translator,
): string {
  if (item.productFamily) {
    return t(PRODUCT_DESCRIPTION_KEYS[item.productFamily]);
  }
  if (item.skillFamily) {
    return t(SKILL_DESCRIPTION_KEYS[item.skillFamily]);
  }
  return item.description;
}

function installedToolReferences(
  definition: CapabilityDefinition,
  installation: CapabilityInstallation,
  t: Translator,
): AgentProfileReference[] {
  const dependencies = definition.dependencies
    .filter((dependency) => dependency.kind === "tool")
    .map((dependency) => ({
      id: dependency.capabilityId,
      name: dependency.capabilityId,
      description: dependency.versionRange,
      available: installation.enabled,
    }));
  const permissions = definition.permissions.capabilities.map((capability) => ({
    id: capability,
    name: capability,
    description: t("capabilities.agentDirectory.permissionDeclared"),
    available: installation.enabled,
  }));
  return dedupeReferences([...dependencies, ...permissions]);
}

function installedSkillReferences(
  definition: CapabilityDefinition,
  t: Translator,
): AgentProfileReference[] {
  return definition.dependencies
    .filter((dependency) => dependency.kind === "skill")
    .map((dependency) => ({
      id: dependency.capabilityId,
      name: dependency.capabilityId,
      description: dependency.required
        ? t("capabilities.skillRegistry.required")
        : t("capabilities.skillRegistry.optional"),
      available: true,
    }));
}

function dedupeReferences(
  items: readonly AgentProfileReference[],
): AgentProfileReference[] {
  const byId = new Map<string, AgentProfileReference>();
  for (const item of items) {
    if (!byId.has(item.id)) byId.set(item.id, item);
  }
  return [...byId.values()];
}

function sourceLabel(
  source: CapabilityDefinition["source"],
  t: Translator,
): string {
  if (source === "builtin") return t("capabilities.origin.builtin");
  if (source === "local_upload") return t("capabilities.origin.local");
  if (source === "mcp") return t("capabilities.origin.mcp");
  if (source === "generated") {
    return t("capabilities.skillRegistry.source.generated");
  }
  return t("capabilities.add.manual");
}

function statusLabel(
  status: CapabilityInstallation["status"],
  t: Translator,
): string {
  if (status === "enabled") return t("capabilities.status.enabled");
  if (status === "installed_disabled") {
    return t("capabilities.status.disabled");
  }
  if (status === "superseded") return t("capabilities.status.superseded");
  return status;
}

function initials(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "AI";
  return [...trimmed].slice(0, 2).join("").toLocaleUpperCase();
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function normalize(value: string): string {
  return value.normalize("NFC").trim().toLocaleLowerCase();
}

const fallbackTranslator: Translator = ((key: TranslationKey) =>
  key) as Translator;
