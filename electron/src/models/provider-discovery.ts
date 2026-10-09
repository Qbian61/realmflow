import type { BuiltinModelProviderId } from "../../../domain/model-provider-catalog";
import type { ModelProviderDiscoverySnapshot } from "../../../shared/business";

type ProviderDiscoveryDependencies = {
  environment: Readonly<Record<string, string | undefined>>;
  homeDirectory: string;
  readTextFile: (path: string) => Promise<string>;
};

const PROVIDER_ENVIRONMENT_KEYS: Partial<
  Record<BuiltinModelProviderId, readonly string[]>
> = {
  openai: ["OPENAI_API_KEY"],
  anthropic: ["ANTHROPIC_API_KEY"],
  deepseek: ["DEEPSEEK_API_KEY"],
  ark: ["ARK_API_KEY", "VOLCENGINE_API_KEY"],
  "ark-agent-plan": ["ARK_API_KEY", "VOLCENGINE_API_KEY"],
  "ark-coding-plan": ["ARK_API_KEY", "VOLCENGINE_API_KEY"],
  groq: ["GROQ_API_KEY"],
  "moonshotai-cn": ["MOONSHOT_API_KEY", "KIMI_API_KEY"],
  openrouter: ["OPENROUTER_API_KEY"],
  zai: ["ZAI_API_KEY"],
};

const DISCOVERABLE_PROVIDER_IDS = Object.freeze(
  Object.keys(PROVIDER_ENVIRONMENT_KEYS) as BuiltinModelProviderId[],
);

export class ProviderDiscoveryService {
  constructor(private readonly dependencies: ProviderDiscoveryDependencies) {}

  async discover(): Promise<ModelProviderDiscoverySnapshot> {
    const providers: ModelProviderDiscoverySnapshot["providers"] = [];
    let failed = false;
    for (const catalogId of DISCOVERABLE_PROVIDER_IDS) {
      const fromEnvironment = this.resolveEnvironmentCredential(catalogId);
      if (fromEnvironment) {
        providers.push({ catalogId, credentialDetected: true });
        continue;
      }
      if (catalogId !== "openai") continue;
      try {
        if (await this.resolveOpenAiAuthFile()) {
          providers.push({ catalogId, credentialDetected: true });
        }
      } catch {
        failed = true;
      }
    }
    return { providers, failed };
  }

  async resolveCredential(
    catalogId: BuiltinModelProviderId,
  ): Promise<string | undefined> {
    const fromEnvironment = this.resolveEnvironmentCredential(catalogId);
    if (fromEnvironment) return fromEnvironment;
    if (catalogId !== "openai") return undefined;
    try {
      return await this.resolveOpenAiAuthFile();
    } catch {
      return undefined;
    }
  }

  private resolveEnvironmentCredential(
    catalogId: BuiltinModelProviderId,
  ): string | undefined {
    for (const name of PROVIDER_ENVIRONMENT_KEYS[catalogId] ?? []) {
      const value = this.dependencies.environment[name]?.trim();
      if (value) return value;
    }
    return undefined;
  }

  private async resolveOpenAiAuthFile(): Promise<string | undefined> {
    const content = await this.dependencies.readTextFile(
      `${this.dependencies.homeDirectory}/.codex/auth.json`,
    );
    const parsed = JSON.parse(content) as unknown;
    if (!isRecord(parsed)) return undefined;
    const direct = parsed.OPENAI_API_KEY;
    if (typeof direct === "string" && direct.trim()) return direct.trim();
    const tokens = parsed.tokens;
    if (!isRecord(tokens)) return undefined;
    const accessToken = tokens.access_token;
    return typeof accessToken === "string" && accessToken.trim()
      ? accessToken.trim()
      : undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
