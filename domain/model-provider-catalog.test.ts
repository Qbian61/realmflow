import { describe, expect, it } from "vitest";
import {
  BUILTIN_MODEL_PROVIDERS,
  MODEL_CATALOG_VERSION,
  MODEL_PROVIDER_CATALOG,
  getBuiltinModelProvider,
} from "./model-provider-catalog";

const expectedModelCounts = {
  "amazon-bedrock": 193,
  "ant-ling": 5,
  anthropic: 17,
  openai: 44,
  deepseek: 2,
  ark: 4,
  "ark-agent-plan": 13,
  "ark-coding-plan": 13,
  "azure-openai-responses": 45,
  google: 21,
  groq: 7,
  huggingface: 70,
  minimax: 3,
  "minimax-cn": 3,
  moonshotai: 4,
  "moonshotai-cn": 4,
  nvidia: 20,
  "openai-codex": 9,
  openrouter: 395,
  "vercel-ai-gateway": 301,
  xai: 4,
  xiaomi: 3,
  zai: 8,
  "zai-coding-cn": 4,
} as const;

describe("builtin model provider catalog", () => {
  it("pins the complete llm-space provider catalog to one immutable version", () => {
    expect(MODEL_CATALOG_VERSION).toBe(3);
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
      expect(definition.catalogSource).toMatchObject({
        verifiedAt: "2026-10-17",
        upstreamPackage: "@earendil-works/pi-ai@1.3.0",
      });
      expect(new URL(definition.catalogSource.documentationUrl).protocol).toBe(
        "https:",
      );

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

  it("uses the official multimodal DeepSeek Flash route", () => {
    const deepseek = getBuiltinModelProvider("deepseek");

    expect(deepseek?.models[0]).toMatchObject({
      id: "deepseek-flash",
      displayName: "DeepSeek-V4.1-Flash",
      inputTypes: ["text", "image"],
      capabilities: {
        text: true,
        vision: true,
        toolCalling: true,
        structuredOutput: true,
      },
    });
    expect(deepseek?.models.map(({ id }) => id)).not.toContain(
      "deepseek-v4-flash",
    );
    expect(deepseek?.defaultProfile).toMatchObject({
      id: "builtin-deepseek-default",
      modelId: "deepseek-flash",
      inputTypes: ["text", "image"],
      capabilities: {
        vision: true,
      },
    });
  });

  it("matches official first-party model capabilities and active routes", () => {
    const anthopicModels = getBuiltinModelProvider("anthropic")?.models ?? [];
    expect(anthopicModels).toHaveLength(17);
    expect(
      anthopicModels.every(
        ({ inputTypes, capabilities }) =>
          inputTypes.includes("image") && capabilities.vision,
      ),
    ).toBe(true);
    expect(
      anthopicModels.find(({ id }) => id === "claude-opus-5"),
    ).toMatchObject({
      contextWindow: 1_000_000,
      maxOutputTokens: 128_000,
    });

    expect(
      getBuiltinModelProvider("openai")?.models.find(
        ({ id }) => id === "gpt-5.5",
      ),
    ).toMatchObject({
      inputTypes: ["text", "image"],
      contextWindow: 1_050_000,
      maxOutputTokens: 128_000,
    });

    const googleIds =
      getBuiltinModelProvider("google")?.models.map(({ id }) => id) ?? [];
    expect(googleIds).toContain("gemini-4-argon");
    expect(googleIds).toContain("gemini-3.8-flash");
    expect(googleIds).not.toContain(
      "gemini-2.5-computer-use-preview-10-2025",
    );
    expect(googleIds).not.toContain("gemini-3.1-flash-lite-preview");

    expect(
      getBuiltinModelProvider("ant-ling")?.models.map(({ id }) => id),
    ).toEqual([
      "Ling-3.1-flash",
      "Ling-3.0-flash",
      "Ling-2.6-1T",
      "Ling-2.6-flash",
      "Ring-2.6-1T",
    ]);

    expect(
      getBuiltinModelProvider("groq")?.models.map(({ id }) => id),
    ).toEqual([
      "llama-3.1-8b-instant",
      "llama-3.3-70b-versatile",
      "openai/gpt-oss-120b",
      "openai/gpt-oss-20b",
      "openai/gpt-oss-safeguard-20b",
      "minimaxai/minimax-m2.7",
      "qwen/qwen3.8-27b",
    ]);
    expect(
      getBuiltinModelProvider("groq")?.models.find(
        ({ id }) => id === "minimaxai/minimax-m2.7",
      ),
    ).toMatchObject({
      contextWindow: 196_608,
      maxOutputTokens: 131_072,
      inputTypes: ["text"],
    });

    expect(
      getBuiltinModelProvider("minimax")?.models.find(
        ({ id }) => id === "MiniMax-M3",
      ),
    ).toMatchObject({
      contextWindow: 1_000_000,
      inputTypes: ["text", "image"],
      capabilities: { vision: true },
    });
    expect(
      getBuiltinModelProvider("moonshotai")?.models.find(
        ({ id }) => id === "kimi-k3",
      ),
    ).toMatchObject({
      contextWindow: 1_048_576,
      inputTypes: ["text", "image"],
      capabilities: { vision: true },
    });

    expect(
      getBuiltinModelProvider("xiaomi")?.models.map(({ id }) => id),
    ).toEqual([
      "mimo-v2.6-flash",
      "mimo-v2.6-pro",
      "mimo-v2.6-pro-ultraspeed",
    ]);
    expect(
      getBuiltinModelProvider("xiaomi")?.models.every(
        ({ contextWindow, maxOutputTokens, capabilities }) =>
          contextWindow === 1_048_576 &&
          maxOutputTokens === 131_072 &&
          capabilities.vision,
      ),
    ).toBe(true);

    expect(
      getBuiltinModelProvider("zai")?.models.find(
        ({ id }) => id === "glm-5.3-flashx",
      ),
    ).toMatchObject({
      contextWindow: 1_000_000,
      maxOutputTokens: 131_072,
      inputTypes: ["text", "image"],
      capabilities: { vision: true },
    });
    expect(getBuiltinModelProvider("zai")?.provider.baseUrl).toBe(
      "https://api.z.ai/api/paas/v4",
    );
  });

  it("matches the official Ark API, Agent Plan, and Coding Plan catalogs", () => {
    expect(getBuiltinModelProvider("ark")?.models).toMatchObject([
      {
        id: "doubao-seed-evolving",
        contextWindow: 1_048_576,
        maxOutputTokens: 262_144,
        inputTypes: ["text", "image"],
      },
      {
        id: "doubao-seed-2-1-pro-260915",
        contextWindow: 1_048_576,
        maxOutputTokens: 262_144,
        inputTypes: ["text", "image"],
      },
      {
        id: "doubao-seed-2-1-lite-260915",
        contextWindow: 1_048_576,
        maxOutputTokens: 262_144,
        inputTypes: ["text", "image"],
      },
      {
        id: "doubao-seed-2-1-turbo-260628",
        contextWindow: 262_144,
        maxOutputTokens: 262_144,
        inputTypes: ["text", "image"],
      },
    ]);

    const expectedPlanModelIds = [
      "doubao-seed-2.0-mini",
      "doubao-seed-2.1-lite",
      "deepseek-v4-flash",
      "glm-5.3-flash",
      "doubao-seed-2.1-pro",
      "doubao-seed-evolving",
      "minimax-m3",
      "glm-5.3",
      "kimi-k2.7-code",
      "kimi-k2.8-preview",
      "deepseek-v4-pro",
      "kimi-k3",
      "deepseek-v4.1-flash",
    ];
    expect(
      getBuiltinModelProvider("ark-agent-plan")?.models.map(({ id }) => id),
    ).toEqual(expectedPlanModelIds);
    expect(
      getBuiltinModelProvider("ark-coding-plan")?.models.map(({ id }) => id),
    ).toEqual(expectedPlanModelIds);

    for (const id of ["ark-agent-plan", "ark-coding-plan"] as const) {
      expect(
        getBuiltinModelProvider(id)?.models.find(
          ({ id: modelId }) => modelId === "deepseek-v4.1-flash",
        ),
      ).toMatchObject({
        contextWindow: 1_048_576,
        maxOutputTokens: 393_216,
        inputTypes: ["text", "image"],
        capabilities: { vision: true },
      });
      expect(
        getBuiltinModelProvider(id)?.models.find(
          ({ id: modelId }) => modelId === "glm-5.3-flash",
        ),
      ).toMatchObject({
        contextWindow: 1_048_576,
        maxOutputTokens: 131_072,
        inputTypes: ["text", "image"],
        capabilities: { vision: true },
      });
    }
  });

  it("contains only models still exposed by public aggregator APIs", () => {
    const huggingFaceIds =
      getBuiltinModelProvider("huggingface")?.models.map(({ id }) => id) ?? [];
    expect(huggingFaceIds).not.toEqual(
      expect.arrayContaining([
        "MiniMaxAI/MiniMax-M2",
        "MiniMaxAI/MiniMax-M2.1",
        "moonshotai/Kimi-K2-Thinking",
        "Qwen/Qwen3-Coder-480B-A35B-Instruct",
        "Qwen/Qwen3-Coder-Next",
        "Qwen/Qwen3-Next-80B-A3B-Thinking",
        "Qwen/Qwen3-VL-235B-A22B-Thinking",
        "XiaomiMiMo/MiMo-V2-Flash",
      ]),
    );
    expect(
      getBuiltinModelProvider("huggingface")?.models.find(
        ({ id }) => id === "MiniMaxAI/MiniMax-M3",
      ),
    ).toMatchObject({
      contextWindow: 1_000_000,
      inputTypes: ["text", "image"],
    });

    expect(
      getBuiltinModelProvider("openrouter")?.models.map(({ id }) => id),
    ).not.toContain("auto");
    expect(
      getBuiltinModelProvider("openrouter")?.models.find(
        ({ id }) => id === "deepseek/deepseek-v4.1-flash",
      ),
    ).toMatchObject({
      contextWindow: 1_048_576,
      maxOutputTokens: 393_216,
      inputTypes: ["text", "image"],
    });
    expect(
      getBuiltinModelProvider("openrouter")?.models.find(
        ({ id }) => id === "moonshotai/kimi-k3",
      ),
    ).toMatchObject({
      contextWindow: 1_048_576,
      maxOutputTokens: 943_718,
      inputTypes: ["text", "image"],
    });
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
      expect(Object.isFrozen(definition.catalogSource)).toBe(true);
      expect(Object.isFrozen(definition.models)).toBe(true);
      for (const model of definition.models) {
        expect(Object.isFrozen(model)).toBe(true);
        expect(Object.isFrozen(model.inputTypes)).toBe(true);
        expect(Object.isFrozen(model.capabilities)).toBe(true);
      }
    }
  });
});
