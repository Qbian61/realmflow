import { describe, expect, it } from "vitest";
import type { CapabilityCatalogSnapshotDto } from "../../../shared/capability-catalog";
import type { ToolCatalogDto } from "../../../shared/tool-catalog";
import {
  buildProductCapabilityItems,
  filterProductCapabilityItems,
} from "./product-capability-directory-model";

describe("product capability directory model", () => {
  it("prefers an aggregated catalog Tool over an installed native Tool with the same runtime", () => {
    const items = buildProductCapabilityItems({
      kind: "tool",
      catalog: catalog({
        tools: [
          catalogItem("tool", "filesystem_read", "Filesystem read", {
            capabilities: ["filesystem.read"],
            modelFacing: {
              mode: "facade",
              kind: "facade",
              visibility: "direct",
              coveredPrimitiveToolIds: [
                "builtin.files.list",
                "builtin.files.read",
              ],
              maxRisk: "low",
            },
          }),
        ],
      }),
      capabilities: capabilitySnapshot([
        capability(
          "com.example.filesystem-read",
          "tool",
          "Filesystem read",
          { kind: "tool", definitionId: "filesystem_read" },
        ),
      ]),
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "product:filesystem",
      group: "files-knowledge",
      source: "catalog",
      coverageCount: 2,
      productFamily: "filesystem",
    });
  });

  it("keeps catalog Skills and custom native Skills without registry sections", () => {
    const items = buildProductCapabilityItems({
      kind: "skill",
      catalog: catalog({
        skills: [
          catalogItem("skill", "requirement_analysis", "Requirement analysis", {
            requiredTools: [
              {
                toolId: "builtin.realmflow.requirement.read",
                versionRange: ">=1.0.0",
                required: true,
              },
            ],
          }),
        ],
      }),
      capabilities: capabilitySnapshot([
        capability("com.example.release-note", "skill", "Release notes", {
          kind: "skill",
          instructionsPath: "skills/release-note/SKILL.md",
          executable: false,
        }),
      ]),
    });

    expect(items.map(({ id }) => id)).toEqual([
      "requirement_analysis",
      "com.example.release-note",
    ]);
    expect(items.every(({ group }) => group === "workflow-tasks")).toBe(true);
  });

  it("filters by product group and localized search text", () => {
    const items = buildProductCapabilityItems({
      kind: "tool",
      catalog: catalog({
        tools: [
          catalogItem("tool", "filesystem_read", "读取文件", {
            capabilities: ["filesystem.read"],
          }),
          catalogItem("tool", "browser", "浏览器", {
            capabilities: ["network.connect"],
          }),
        ],
      }),
      capabilities: capabilitySnapshot([]),
    });

    expect(
      filterProductCapabilityItems(items, {
        group: "files-knowledge",
        query: "",
      }).map(({ id }) => id),
    ).toEqual(["product:filesystem"]);
    expect(
      filterProductCapabilityItems(items, {
        group: "all",
        query: "浏览",
      }).map(({ id }) => id),
    ).toEqual(["product:browser"]);
  });
});

function catalog(input: {
  tools?: unknown[];
  skills?: unknown[];
}): ToolCatalogDto {
  return {
    packages: [],
    tools: input.tools ?? [],
    skills: input.skills ?? [],
  } as unknown as ToolCatalogDto;
}

function catalogItem(
  kind: "tool" | "skill",
  id: string,
  name: string,
  input: Record<string, unknown>,
) {
  const { modelFacing, ...definitionInput } = input;
  return {
    kind,
    id,
    version: "1.0.0",
    definitionDigest: id.padEnd(64, "a").slice(0, 64),
    definition: {
      name,
      description: `${name} description`,
      origin: "builtin",
      ...definitionInput,
    },
    enabledPreference: true,
    status: "enabled",
    dependencyIssues: [],
    revision: 1,
    updatedAt: 1,
    ...(modelFacing ? { modelFacing } : {}),
  };
}

function capabilitySnapshot(
  values: Array<ReturnType<typeof capability>>,
): CapabilityCatalogSnapshotDto {
  return {
    definitions: values.map(({ definition }) => definition),
    installations: values.map(({ installation }) => installation),
    displayByDefinitionKey: {},
  } as unknown as CapabilityCatalogSnapshotDto;
}

function capability(
  id: string,
  kind: "tool" | "skill",
  name: string,
  runtime: Record<string, unknown>,
) {
  const definition = {
    schemaVersion: 1,
    id,
    kind,
    version: "1.0.0",
    source: "local_upload",
    manifestDigest: id.padEnd(64, "b").slice(0, 64),
    definitionDigest: id.padEnd(64, "c").slice(0, 64),
    name,
    description: `${name} description`,
    runtime,
    permissions: {
      capabilities: [],
      maximumRisk: "low",
      pathPrefixes: [],
      networkTargets: [],
    },
    dependencies: [],
    compatibility: {
      realmflowVersionRange: ">=0.1.0",
      platforms: ["darwin"],
    },
    testPlan: [],
    publishedAt: 1,
  };
  return {
    definition,
    installation: {
      id: `installation.${id}`,
      capabilityId: id,
      capabilityVersion: "1.0.0",
      capabilityDigest: definition.definitionDigest,
      scope: { kind: "global" },
      enabled: true,
      permissionCeiling: definition.permissions,
      status: "enabled",
      revision: 1,
      installedAt: 1,
      updatedAt: 1,
    },
  };
}
