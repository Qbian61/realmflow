import type {
  ModelCapabilities,
  ModelInputType,
  ModelLifecycleStatus,
  ModelProfile,
  ModelProvider,
} from "./model";
import { MODEL_PROVIDER_CATALOG_SEEDS } from "./model-provider-catalog-data";

export const MODEL_CATALOG_VERSION = 1;

export type BuiltinModelProviderId =
  | "amazon-bedrock"
  | "ant-ling"
  | "anthropic"
  | "ark"
  | "ark-agent-plan"
  | "ark-coding-plan"
  | "azure-openai-responses"
  | "deepseek"
  | "google"
  | "groq"
  | "huggingface"
  | "minimax"
  | "minimax-cn"
  | "moonshotai"
  | "moonshotai-cn"
  | "nvidia"
  | "openai"
  | "openai-codex"
  | "openrouter"
  | "vercel-ai-gateway"
  | "xai"
  | "xiaomi"
  | "zai"
  | "zai-coding-cn";

export type CatalogModelDefinition = Readonly<{
  id: string;
  displayName: string;
  apiType: ModelProvider["type"];
  contextWindow: number;
  maxOutputTokens: number;
  inputTypes: readonly ModelInputType[];
  reasoning: boolean;
  capabilities: Readonly<ModelCapabilities>;
  inputCostPerMillionTokens: number;
  outputCostPerMillionTokens: number;
  defaultEnabled: boolean;
  lifecycleStatus: ModelLifecycleStatus;
}>;

export type BuiltinModelProviderDefinition = Readonly<{
  id: BuiltinModelProviderId;
  catalogVersion: number;
  website: string;
  productionVisible: boolean;
  authentication:
    | "bearer"
    | "anthropic_api_key"
    | "google_api_key"
    | "aws"
    | "oauth";
  recommendedGroup: "recommended" | "builtin";
  provider: Readonly<ModelProvider>;
  models: readonly CatalogModelDefinition[];
  defaultProfile: Readonly<ModelProfile>;
}>;

function freezeDefinition(
  seed: (typeof MODEL_PROVIDER_CATALOG_SEEDS)[number],
): BuiltinModelProviderDefinition {
  const models = seed.models.map((model) =>
    Object.freeze({
      ...model,
      id: model.id.trim(),
      displayName: model.displayName.trim(),
      inputCostPerMillionTokens: Math.max(
        0,
        model.inputCostPerMillionTokens,
      ),
      outputCostPerMillionTokens: Math.max(
        0,
        model.outputCostPerMillionTokens,
      ),
      inputTypes: Object.freeze([...model.inputTypes]),
      capabilities: Object.freeze({ ...model.capabilities }),
    }),
  );
  const defaultModel = models[0];
  return Object.freeze({
    ...seed,
    catalogVersion: MODEL_CATALOG_VERSION,
    provider: Object.freeze({
      ...seed.provider,
      source: "builtin",
      catalogProviderId: seed.id,
      baseUrlOverridden: false,
    }),
    models: Object.freeze(models),
    defaultProfile: Object.freeze({
      id: `${seed.provider.id}-default`,
      providerId: seed.provider.id,
      modelId: defaultModel.id,
      displayName: defaultModel.displayName,
      source: "catalog",
      catalogProviderId: seed.id,
      catalogModelId: defaultModel.id,
      catalogVersion: MODEL_CATALOG_VERSION,
      defaultEnabled: defaultModel.defaultEnabled,
      enabledOverride: null,
      enabled: defaultModel.defaultEnabled,
      lifecycleStatus: defaultModel.lifecycleStatus,
      capabilities: defaultModel.capabilities,
      inputTypes: [...defaultModel.inputTypes],
      reasoning: defaultModel.reasoning,
      contextWindow: defaultModel.contextWindow,
      maxOutputTokens: defaultModel.maxOutputTokens,
      timeoutMs: 120_000,
      maxRetries: 2,
      maxConcurrency: 2,
      inputCostPerMillionTokens: defaultModel.inputCostPerMillionTokens,
      outputCostPerMillionTokens: defaultModel.outputCostPerMillionTokens,
    }),
  });
}

export const MODEL_PROVIDER_CATALOG: readonly BuiltinModelProviderDefinition[] =
  Object.freeze(MODEL_PROVIDER_CATALOG_SEEDS.map(freezeDefinition));

export const BUILTIN_MODEL_PROVIDERS = Object.freeze(
  MODEL_PROVIDER_CATALOG.filter(({ productionVisible }) => productionVisible),
);

export function getBuiltinModelProvider(
  id: string,
): BuiltinModelProviderDefinition | undefined {
  return MODEL_PROVIDER_CATALOG.find((provider) => provider.id === id);
}

export function getConfigurableBuiltinModelProvider(
  id: string,
): BuiltinModelProviderDefinition | undefined {
  return BUILTIN_MODEL_PROVIDERS.find((provider) => provider.id === id);
}

export function getBuiltinModelProviderByProviderId(
  providerId: string,
): BuiltinModelProviderDefinition | undefined {
  return MODEL_PROVIDER_CATALOG.find(
    (provider) => provider.provider.id === providerId,
  );
}

export function catalogModelProfileId(
  providerId: string,
  modelId: string,
): string {
  return `${providerId}:${modelId}`;
}

export function createCatalogModelProfile(
  definition: BuiltinModelProviderDefinition,
  model: CatalogModelDefinition,
): ModelProfile {
  return {
    id: catalogModelProfileId(definition.provider.id, model.id),
    providerId: definition.provider.id,
    modelId: model.id,
    displayName: model.displayName,
    apiType: model.apiType,
    source: "catalog",
    catalogProviderId: definition.id,
    catalogModelId: model.id,
    catalogVersion: definition.catalogVersion,
    defaultEnabled: model.defaultEnabled,
    enabledOverride: null,
    enabled: model.defaultEnabled,
    lifecycleStatus: model.lifecycleStatus,
    capabilities: { ...model.capabilities },
    inputTypes: [...model.inputTypes],
    reasoning: model.reasoning,
    contextWindow: model.contextWindow,
    maxOutputTokens: model.maxOutputTokens,
    timeoutMs: 120_000,
    maxRetries: 2,
    maxConcurrency: 2,
    inputCostPerMillionTokens: model.inputCostPerMillionTokens,
    outputCostPerMillionTokens: model.outputCostPerMillionTokens,
  };
}
