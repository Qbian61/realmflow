import type {
  CapabilityDefinition,
  CapabilityInstallation,
} from "../../../domain/capability";
import type { CapabilityCatalogSnapshotDto } from "../../../shared/capability-catalog";
import type {
  ToolCatalogDto,
  ToolCatalogSkillDto,
  ToolCatalogToolDto,
} from "../../../shared/tool-catalog";
import type { LocalizedCapabilityDisplay } from "../../../shared/capability-localization";

export const PRODUCT_CAPABILITY_GROUPS = [
  "all",
  "files-knowledge",
  "web-browser",
  "terminal-code",
  "documents-office",
  "workflow-tasks",
  "external-services",
  "runtime-management",
] as const;

export type ProductCapabilityGroup =
  (typeof PRODUCT_CAPABILITY_GROUPS)[number];

export type ProductCapabilityItem = {
  key: string;
  kind: "tool" | "skill";
  id: string;
  name: string;
  description: string;
  version: string;
  group: Exclude<ProductCapabilityGroup, "all">;
  source: "catalog" | "registry" | "native";
  origin: string;
  status: string;
  enabled: boolean;
  coverageCount?: number;
  productFamily?:
    | "assistant-runtime"
    | "filesystem"
    | "git"
    | "realmflow"
    | "knowledge"
    | "web"
    | "browser"
    | "process"
    | "computer"
    | "fixed-layout"
    | "legacy-office"
    | "archive"
    | "document"
    | "spreadsheet"
    | "presentation"
    | "pdf"
    | "image";
  skillFamily?:
    | "bug-fix"
    | "code-review"
    | "feature-implementation"
    | "knowledge-curation"
    | "release-preparation"
    | "repository-onboarding"
    | "requirement-analysis"
    | "technical-design"
    | "test-acceptance"
    | "workflow-recovery";
  readOnly?: boolean;
  catalogItem?: ToolCatalogToolDto | ToolCatalogSkillDto;
  native?: {
    definition: CapabilityDefinition;
    installation: CapabilityInstallation;
    display?: LocalizedCapabilityDisplay;
  };
};

export function buildProductCapabilityItems(input: {
  kind: "tool" | "skill";
  catalog: ToolCatalogDto;
  capabilities: CapabilityCatalogSnapshotDto;
}): ProductCapabilityItem[] {
  const catalogItems =
    input.kind === "tool"
      ? aggregateCatalogTools(input.catalog)
      : latestById(input.catalog.skills).map(fromCatalogSkill);
  const representedRuntimeIds =
    input.kind === "tool"
      ? catalogToolRuntimeIds(input.catalog.tools)
      : new Set(catalogItems.map((item) => item.id));
  const nativeItems = input.capabilities.installations.flatMap(
    (installation) => {
      const definition = input.capabilities.definitions.find(
        (candidate) =>
          candidate.kind === input.kind &&
          candidate.id === installation.capabilityId &&
          candidate.version === installation.capabilityVersion,
      );
      if (
        !definition ||
        representedRuntimeIds.has(runtimeIdentity(definition))
      ) {
        return [];
      }
      const display =
        input.capabilities.displayByDefinitionKey?.[
          `${definition.id}@${definition.version}`
        ];
      return [fromNativeCapability(definition, installation, display)];
    },
  );

  return [...catalogItems, ...deduplicateNative(nativeItems)].sort(
    (left, right) =>
      sourcePriority(left.source) - sourcePriority(right.source) ||
      groupPriority(left.group) - groupPriority(right.group) ||
      left.name.localeCompare(right.name) ||
      left.id.localeCompare(right.id),
  );
}

export function filterProductCapabilityItems(
  items: readonly ProductCapabilityItem[],
  filter: { group: ProductCapabilityGroup; query: string },
): ProductCapabilityItem[] {
  const query = normalize(filter.query);
  return items.filter((item) => {
    if (filter.group !== "all" && item.group !== filter.group) return false;
    if (!query) return true;
    return normalize(
      [item.name, item.description, item.id, item.group].join(" "),
    ).includes(query);
  });
}

function fromCatalogTool(item: ToolCatalogToolDto): ProductCapabilityItem {
  return {
    key: `catalog:tool:${item.id}`,
    kind: "tool",
    id: item.id,
    name: item.display?.name ?? item.definition.name,
    description: item.display?.description ?? item.definition.description,
    version: item.version,
    group: resolveProductGroup(item),
    source: "catalog",
    origin: item.definition.origin,
    status: item.status,
    enabled: item.enabledPreference,
    coverageCount:
      item.modelFacing?.kind === "facade"
        ? item.modelFacing.coveredPrimitiveToolIds.length
        : undefined,
    catalogItem: item,
  };
}

function aggregateCatalogTools(
  catalog: ToolCatalogDto,
): ProductCapabilityItem[] {
  const groups = new Map<
    string,
    {
      representative: ToolCatalogToolDto;
      members: ToolCatalogToolDto[];
      productFamily?: ProductCapabilityItem["productFamily"];
    }
  >();
  for (const item of latestById(catalog.tools)) {
    const identity = toolProductIdentity(item);
    if (!identity) continue;
    const current = groups.get(identity.key);
    if (current) {
      current.members.push(item);
      if (
        current.representative.modelFacing?.kind !== "facade" &&
        item.modelFacing?.kind === "facade"
      ) {
        current.representative = item;
      }
    } else {
      groups.set(identity.key, {
        representative: item,
        members: [item],
        ...(identity.productFamily
          ? { productFamily: identity.productFamily }
          : {}),
      });
    }
  }
  return [...groups.entries()].map(
    ([productId, { representative, members, productFamily }]) => {
      const base = fromCatalogTool(representative);
      const representativePackageId =
        representative.definition.package?.packageId ??
        inferredBuiltinPackageId(representative.id);
      const packageItem = catalog.packages.find(
        ({ packageId, version }) =>
          packageId === representativePackageId &&
          version ===
            (representative.definition.package?.packageVersion ??
              representative.version),
      );
      const covered = new Set(
        members.flatMap((member) =>
          member.modelFacing?.kind === "facade"
            ? member.modelFacing.coveredPrimitiveToolIds
            : [member.id],
        ),
      );
      return {
        ...base,
        key: `catalog:tool-product:${productId}`,
        id: `product:${productId}`,
        name:
          productFamily || representative.modelFacing?.kind === "facade"
            ? base.name
            : packageItem?.display?.name ?? packageItem?.name ?? base.name,
        description:
          productFamily || representative.modelFacing?.kind === "facade"
            ? base.description
            : packageItem?.display?.description ??
              packageItem?.description ??
              base.description,
        group: productToolGroup(
          productId,
          productFamily,
          representativePackageId,
          base.group,
        ),
        enabled: members.some(({ status }) => status === "enabled"),
        status: members.some(({ status }) => status === "enabled")
          ? "enabled"
          : representative.status,
        coverageCount: covered.size,
        readOnly: true,
        ...(productFamily ? { productFamily } : {}),
      };
    },
  );
}

function catalogToolRuntimeIds(tools: ToolCatalogDto["tools"]): Set<string> {
  return new Set(
    latestById(tools).flatMap((item) => [
      item.id,
      item.definition.id,
      ...(item.modelFacing?.kind === "facade"
        ? item.modelFacing.coveredPrimitiveToolIds
        : []),
    ]),
  );
}

function productToolGroup(
  productId: string,
  productFamily: ProductCapabilityItem["productFamily"] | undefined,
  packageId: string,
  fallback: ProductCapabilityItem["group"],
): ProductCapabilityItem["group"] {
  if (productFamily === "filesystem" || productFamily === "knowledge") {
    return "files-knowledge";
  }
  if (productFamily === "git") return "terminal-code";
  if (productFamily === "process") return "terminal-code";
  if (productFamily === "realmflow") return "workflow-tasks";
  if (
    productFamily === "assistant-runtime" ||
    productFamily === "computer"
  ) {
    return "runtime-management";
  }
  if (productFamily === "web" || productFamily === "browser") {
    return "web-browser";
  }
  if (
    productFamily === "fixed-layout" ||
    productFamily === "legacy-office" ||
    productFamily === "archive" ||
    productFamily === "document" ||
    productFamily === "spreadsheet" ||
    productFamily === "presentation" ||
    productFamily === "pdf" ||
    productFamily === "image"
  ) {
    return "documents-office";
  }
  if (
    productId === "browser" ||
    packageId === "realmflow.builtin.web"
  ) {
    return "web-browser";
  }
  if (packageId === "realmflow.builtin.computer") {
    return "runtime-management";
  }
  return fallback;
}

function fromCatalogSkill(item: ToolCatalogSkillDto): ProductCapabilityItem {
  const skillFamily = builtinSkillFamily(item.id);
  return {
    key: `catalog:skill:${item.id}`,
    kind: "skill",
    id: item.id,
    name: item.display?.name ?? item.definition.name,
    description: item.display?.description ?? item.definition.description,
    version: item.version,
    group: resolveProductGroup(item),
    source: item.registry ? "registry" : "catalog",
    origin: item.definition.origin,
    status: item.status,
    enabled: item.enabledPreference,
    catalogItem: item,
    ...(skillFamily ? { skillFamily } : {}),
  };
}

function builtinSkillFamily(
  id: string,
): ProductCapabilityItem["skillFamily"] | undefined {
  const suffix = id.startsWith("builtin.skill.")
    ? id.slice("builtin.skill.".length).replaceAll("_", "-")
    : "";
  const known = new Set<NonNullable<ProductCapabilityItem["skillFamily"]>>([
    "bug-fix",
    "code-review",
    "feature-implementation",
    "knowledge-curation",
    "release-preparation",
    "repository-onboarding",
    "requirement-analysis",
    "technical-design",
    "test-acceptance",
    "workflow-recovery",
  ]);
  return known.has(suffix as NonNullable<ProductCapabilityItem["skillFamily"]>)
    ? (suffix as NonNullable<ProductCapabilityItem["skillFamily"]>)
    : undefined;
}

function fromNativeCapability(
  definition: CapabilityDefinition,
  installation: CapabilityInstallation,
  display?: LocalizedCapabilityDisplay,
): ProductCapabilityItem {
  return {
    key: `native:${installation.id}`,
    kind: definition.kind as "tool" | "skill",
    id: definition.id,
    name: display?.name ?? definition.name,
    description: display?.description ?? definition.description,
    version: definition.version,
    group: resolveProductGroup(definition),
    source: "native",
    origin: definition.source,
    status: installation.status,
    enabled: installation.enabled,
    native: { definition, installation, ...(display ? { display } : {}) },
  };
}

function toolProductIdentity(item: ToolCatalogToolDto): {
  key: string;
  productFamily?: ProductCapabilityItem["productFamily"];
} | undefined {
  const packageId =
    item.definition.package?.packageId ?? inferredBuiltinPackageId(item.id);
  if (packageId === "realmflow.assistant_runtime") {
    return { key: "assistant-runtime", productFamily: "assistant-runtime" };
  }
  if (item.id.startsWith("filesystem_") || packageId === "realmflow.builtin.files") {
    return { key: "filesystem", productFamily: "filesystem" };
  }
  if (item.id.startsWith("git_") || packageId === "realmflow.builtin.git") {
    return { key: "git", productFamily: "git" };
  }
  if (
    item.id.startsWith("realmflow_") ||
    packageId === "realmflow.builtin.domain"
  ) {
    return { key: "realmflow", productFamily: "realmflow" };
  }
  const familyByPackage: Record<
    string,
    NonNullable<ProductCapabilityItem["productFamily"]>
  > = {
    "realmflow.builtin.archives": "archive",
    "realmflow.builtin.browser": "browser",
    "realmflow.builtin.computer": "computer",
    "realmflow.builtin.documents": "document",
    "realmflow.builtin.fixed-layout": "fixed-layout",
    "realmflow.builtin.image": "image",
    "realmflow.builtin.knowledge": "knowledge",
    "realmflow.builtin.legacy-office": "legacy-office",
    "realmflow.builtin.pdf": "pdf",
    "realmflow.builtin.presentation": "presentation",
    "realmflow.builtin.spreadsheet": "spreadsheet",
    "realmflow.builtin.web": "web",
  };
  const packageFamily = familyByPackage[packageId];
  if (packageFamily) {
    return { key: packageFamily, productFamily: packageFamily };
  }
  const familyByFacade: Partial<
    Record<string, NonNullable<ProductCapabilityItem["productFamily"]>>
  > = {
    archive: "archive",
    browser: "browser",
    document: "document",
    image: "image",
    pdf: "pdf",
    presentation: "presentation",
    process: "process",
    spreadsheet: "spreadsheet",
  };
  if (item.modelFacing?.kind === "facade") {
    const facadeFamily = familyByFacade[item.id];
    return {
      key: item.id,
      ...(facadeFamily ? { productFamily: facadeFamily } : {}),
    };
  }
  if (
    item.modelFacing?.kind === "primitive" &&
    item.modelFacing.visibility !== "direct"
  ) {
    return undefined;
  }
  return { key: packageId || item.id };
}

function inferredBuiltinPackageId(id: string): string {
  const match = /^builtin\.([a-z0-9_-]+)\./u.exec(id);
  return match ? `realmflow.builtin.${match[1]}` : "";
}

function runtimeIdentity(definition: CapabilityDefinition): string {
  if (
    definition.kind === "tool" &&
    definition.runtime.kind === "tool"
  ) {
    return definition.runtime.definitionId;
  }
  return definition.id;
}

function deduplicateNative(
  items: ProductCapabilityItem[],
): ProductCapabilityItem[] {
  const byId = new Map<string, ProductCapabilityItem>();
  for (const item of items) {
    const current = byId.get(item.id);
    if (!current || compareVersions(item.version, current.version) > 0) {
      byId.set(item.id, item);
    }
  }
  return [...byId.values()];
}

function latestById<
  T extends ToolCatalogToolDto | ToolCatalogSkillDto,
>(items: T[]): T[] {
  const latest = new Map<string, T>();
  for (const item of items) {
    const current = latest.get(item.id);
    if (!current || compareVersions(item.version, current.version) > 0) {
      latest.set(item.id, item);
    }
  }
  return [...latest.values()];
}

function resolveProductGroup(
  item:
    | ToolCatalogToolDto
    | ToolCatalogSkillDto
    | CapabilityDefinition,
): Exclude<ProductCapabilityGroup, "all"> {
  const searchable = normalize(groupSignals(item).join(" "));
  if (
    matches(searchable, [
      "document",
      "spreadsheet",
      "presentation",
      "powerpoint",
      "pdf",
      "image",
      "archive",
      "office",
    ])
  ) {
    return "documents-office";
  }
  if (
    matches(searchable, [
      "filesystem",
      "file",
      "folder",
      "knowledge",
      "memory",
    ])
  ) {
    return "files-knowledge";
  }
  if (
    matches(searchable, [
      "browser",
      "web",
      "http",
      "url",
      "network.public",
    ])
  ) {
    return "web-browser";
  }
  if (
    matches(searchable, [
      "process",
      "terminal",
      "shell",
      "code",
      "git",
      "repository",
    ])
  ) {
    return "terminal-code";
  }
  if (
    matches(searchable, [
      "connector",
      "credential",
      "media",
      "external",
      "publish",
    ])
  ) {
    return "external-services";
  }
  if (
    matches(searchable, [
      "session",
      "subagent",
      "agent",
      "runtime",
      "goal",
      "steer",
      "progress",
      "ask_user",
      "capabilit",
    ])
  ) {
    return "runtime-management";
  }
  return "workflow-tasks";
}

function groupSignals(
  item:
    | ToolCatalogToolDto
    | ToolCatalogSkillDto
    | CapabilityDefinition,
): string[] {
  if ("definition" in item) {
    const requiredTools =
      item.kind === "skill"
        ? (item.definition.requiredTools ?? []).map(({ toolId }) => toolId)
        : [];
    const capabilities =
      item.kind === "tool" ? item.definition.capabilities : [];
    return [
      item.id,
      item.definition.name,
      item.definition.description,
      ...requiredTools,
      ...capabilities,
    ];
  }
  return [
    item.id,
    item.name,
    item.description,
    ...item.permissions.capabilities,
    ...item.dependencies.map(({ capabilityId }) => capabilityId),
  ];
}

function matches(value: string, terms: readonly string[]): boolean {
  return terms.some((term) => value.includes(term));
}

function normalize(value: string): string {
  return value.normalize("NFC").trim().toLocaleLowerCase();
}

function sourcePriority(source: ProductCapabilityItem["source"]): number {
  if (source === "catalog" || source === "registry") return 0;
  return 1;
}

function groupPriority(
  group: Exclude<ProductCapabilityGroup, "all">,
): number {
  return PRODUCT_CAPABILITY_GROUPS.indexOf(group);
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
