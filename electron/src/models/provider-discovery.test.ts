import { describe, expect, it, vi } from "vitest";
import { ProviderDiscoveryService } from "./provider-discovery";

describe("ProviderDiscoveryService", () => {
  it("detects allowlisted environment credentials without exposing values", async () => {
    const service = new ProviderDiscoveryService({
      environment: {
        OPENAI_API_KEY: "sk-private",
        UNRELATED_SECRET: "must-not-leak",
      },
      homeDirectory: "/Users/example",
      readTextFile: vi.fn().mockRejectedValue(new Error("missing")),
    });

    const snapshot = await service.discover();

    expect(snapshot.failed).toBe(false);
    expect(snapshot.providers).toContainEqual({
      catalogId: "openai",
      credentialDetected: true,
    });
    expect(JSON.stringify(snapshot)).not.toContain("sk-private");
    expect(JSON.stringify(snapshot)).not.toContain("UNRELATED_SECRET");
    expect(JSON.stringify(snapshot)).not.toContain("/Users/example");
  });

  it("detects an official authentication file and resolves it only in Main", async () => {
    const readTextFile = vi.fn().mockResolvedValue(
      JSON.stringify({
        OPENAI_API_KEY: "sk-codex-private",
        tokens: { access_token: "oauth-private" },
      }),
    );
    const service = new ProviderDiscoveryService({
      environment: {},
      homeDirectory: "/Users/example",
      readTextFile,
    });

    await expect(service.discover()).resolves.toMatchObject({
      providers: [{ catalogId: "openai", credentialDetected: true }],
    });
    await expect(service.resolveCredential("openai")).resolves.toBe(
      "sk-codex-private",
    );
    expect(readTextFile).toHaveBeenCalledWith("/Users/example/.codex/auth.json");
  });

  it("keeps discovery failures recoverable", async () => {
    const service = new ProviderDiscoveryService({
      environment: {},
      homeDirectory: "/Users/example",
      readTextFile: vi.fn().mockRejectedValue(new Error("permission denied")),
    });

    await expect(service.discover()).resolves.toEqual({
      providers: [],
      failed: true,
    });
    await expect(service.resolveCredential("openai")).resolves.toBeUndefined();
  });
});
