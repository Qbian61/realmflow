import { describe, expect, it } from "vitest";
import {
  BUILTIN_MODEL_PROVIDERS,
  MODEL_CATALOG_VERSION,
  MODEL_PROVIDER_CATALOG,
  getBuiltinModelProvider,
} from "./model-provider-catalog";

const expectedModelCounts = {
  "amazon-bedrock": 109,
  "ant-ling": 3,
  anthropic: 14,
  openai: 46,
  deepseek: 2,
  ark: 5,
  "ark-agent-plan": 8,
  "ark-coding-plan": 8,
  "azure-openai-responses": 46,
  google: 16,
  groq: 7,
  huggingface: 49,
  minimax: 3,
  "minimax-cn": 3,
  moonshotai: 10,
  "moonshotai-cn": 10,
  nvidia: 20,
  "openai-codex": 7,
  openrouter: 271,
  "vercel-ai-gateway": 190,
  xai: 3,
  xiaomi: 6,
  zai: 6,
  "zai-coding-cn": 6,
} as const;

describe("builtin model provider catalog", () => {
  it("pins the complete llm-space provider catalog to one immutable version", () => {
    expect(MODEL_CATALOG_VERSION).toBe(1);
    expect(
      Object.fromEntries(
        MODEL_PROVIDER_CATALOG.map((definition) => [
          definition.id,
          definition.models.length,
        ]),
      ),
    ).toEqual(expectedModelCounts);
    expect(BUILTIN_MODEL_PROVIDERS.map(({ id }) => id)).toEqual([
      "amazon-bedrock",
      "ant-ling",
      "anthropic",
      "ark",
      "ark-agent-plan",
      "ark-coding-plan",
      "azure-openai-responses",
      "deepseek",
      "google",
      "groq",
      "huggingface",
      "minimax",
      "minimax-cn",
      "moonshotai",
      "moonshotai-cn",
      "nvidia",
      "openai",
      "openai-codex",
      "openrouter",
      "vercel-ai-gateway",
      "xai",
      "xiaomi",
      "zai",
      "zai-coding-cn",
    ]);
    expect(getBuiltinModelProvider("amazon-bedrock")).toMatchObject({
      productionVisible: true,
      provider: { type: "bedrock_converse_stream" },
    });
  });

  it("provides complete, protocol-consistent model metadata", () => {
    for (const definition of MODEL_PROVIDER_CATALOG) {
      expect(definition.catalogVersion).toBe(MODEL_CATALOG_VERSION);
      expect(definition.models.length).toBeGreaterThan(0);
      expect(new URL(definition.website).protocol).toBe("https:");
      expect(new URL(definition.provider.baseUrl).protocol).toBe("https:");

      for (const model of definition.models) {
        expect(model.id.trim()).toBe(model.id);
        expect(model.displayName.trim()).toBe(model.displayName);
        expect(model.contextWindow).toBeGreaterThan(0);
        expect(model.maxOutputTokens).toBeGreaterThan(0);
        expect(model.inputTypes).toContain("text");
        expect(model.lifecycleStatus).toBe("active");
        expect(model.inputCostPerMillionTokens).toBeGreaterThanOrEqual(0);
        expect(model.outputCostPerMillionTokens).toBeGreaterThanOrEqual(0);
      }
    }

    expect(
      getBuiltinModelProvider("xai")?.models.map(({ apiType }) => apiType),
    ).toContain("openai_responses");
  });

  it("keeps provider IDs and model IDs unique at their ownership boundaries", () => {
    const providerIds = MODEL_PROVIDER_CATALOG.map(({ id }) => id);
    expect(new Set(providerIds).size).toBe(providerIds.length);

    for (const definition of MODEL_PROVIDER_CATALOG) {
      const modelIds = definition.models.map(({ id }) => id);
      expect(new Set(modelIds).size).toBe(modelIds.length);
    }
  });

  it("deeply freezes all shared catalog metadata", () => {
    expect(Object.isFrozen(MODEL_PROVIDER_CATALOG)).toBe(true);
    for (const definition of MODEL_PROVIDER_CATALOG) {
      expect(Object.isFrozen(definition)).toBe(true);
      expect(Object.isFrozen(definition.provider)).toBe(true);
      expect(Object.isFrozen(definition.models)).toBe(true);
      for (const model of definition.models) {
        expect(Object.isFrozen(model)).toBe(true);
        expect(Object.isFrozen(model.inputTypes)).toBe(true);
        expect(Object.isFrozen(model.capabilities)).toBe(true);
      }
    }
  });
});
