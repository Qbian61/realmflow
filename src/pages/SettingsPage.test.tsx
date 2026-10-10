import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { BusinessApi, SpaceDto, WorkRootDto } from "../../shared/business";
import { LocalizationProvider } from "../localization/LocalizationProvider";
import { ThemeProvider } from "../theme/ThemeProvider";
import { ToastProvider } from "../features/toast/ToastProvider";
import SettingsPage from "./SettingsPage";

const provider = {
  id: "provider-1",
  type: "openai_completions" as const,
  name: "OpenAI",
  baseUrl: "https://api.openai.com/v1",
  enabled: true,
  credentialConfigured: true,
  customHeaderNames: [],
  revision: 3,
};

const profile = {
  id: "profile-1",
  providerId: provider.id,
  modelId: "gpt-4.1",
  displayName: "GPT 4.1",
  enabled: true,
  capabilities: {
    text: true,
    vision: true,
    toolCalling: true,
    structuredOutput: true,
  },
  contextWindow: 128_000,
  timeoutMs: 120_000,
  maxRetries: 2,
  maxConcurrency: 4,
  inputCostPerMillionTokens: 2,
  outputCostPerMillionTokens: 8,
  revision: 2,
};

const currentWorkRoot: WorkRootDto = {
  id: "root-1",
  path: "/Users/test/RealmFlow",
  isCurrent: true,
  revision: 2,
  createdAt: 10,
  lastUsedAt: 20,
};

const historicalWorkRoot: WorkRootDto = {
  id: "root-history",
  path: "/Users/test/PreviousRealmFlow",
  isCurrent: false,
  revision: 2,
  createdAt: 5,
  lastUsedAt: 10,
};

const planningSpace: SpaceDto = {
  id: "space-1",
  path: "/Users/test/Planning",
  label: "Planning Space",
  description: "",
  sortOrder: 0,
  revision: 1,
  createdAt: 10,
  updatedAt: 10,
};

function createBusiness(
  workRoots: WorkRootDto[] = [currentWorkRoot],
): BusinessApi {
  return {
    listWorkRoots: vi.fn().mockResolvedValue(workRoots),
    listSpaces: vi.fn().mockResolvedValue([planningSpace]),
    chooseWorkRoot: vi.fn().mockResolvedValue(null),
    listModels: vi.fn().mockResolvedValue({
      providers: [provider],
      profiles: [profile],
    }),
    listEffectiveModels: vi.fn().mockResolvedValue({
      groups: [
        {
          providerId: provider.id,
          providerName: provider.name,
          providerType: provider.type,
          readiness: "ready",
          models: [
            {
              profileId: profile.id,
              modelId: profile.modelId,
              displayName: profile.displayName,
              capabilities: profile.capabilities,
              contextWindow: profile.contextWindow,
            },
          ],
        },
      ],
    }),
    getApplicationModelDefault: vi.fn().mockResolvedValue({
      mode: "auto",
      revision: 1,
    }),
    listConnectors: vi.fn().mockResolvedValue([]),
    listSkills: vi.fn().mockResolvedValue([]),
    listPermissionGrants: vi.fn().mockResolvedValue([]),
    getBackupStatus: vi.fn().mockResolvedValue({}),
    chooseBackupDestination: vi.fn().mockResolvedValue(null),
    chooseRestoreBundle: vi.fn().mockResolvedValue(null),
    prepareRestore: vi.fn(),
    restartForRestore: vi.fn(),
    revokePermissionGrant: vi.fn(),
    saveConnector: vi.fn(),
    deleteConnector: vi.fn(),
    validateConnector: vi.fn(),
    saveModelProvider: vi.fn().mockImplementation(async (value) => ({
      outcome: "saved",
      provider: {
        id: value.id,
        type: value.type,
        name: value.name,
        baseUrl: value.baseUrl,
        enabled: value.enabled,
        revision: value.expectedRevision + 1,
      },
    })),
    configureBuiltinModelProvider: vi.fn(),
    removeModelProviderCredential: vi.fn(),
    deleteModelProvider: vi.fn().mockResolvedValue({
      outcome: "deleted",
      providerId: provider.id,
    }),
    rotateModelCredentialKey: vi.fn().mockResolvedValue({
      outcome: "rotated",
      requestId: "rotation-request-1",
      fromKeyVersion: 1,
      toKeyVersion: 2,
      credentialCount: 1,
      rotatedAt: 500,
    }),
    saveModelProfile: vi.fn().mockImplementation(async (value) => {
      const { expectedRevision, ...savedProfile } = value;
      return {
        outcome: "saved",
        profile: { ...savedProfile, revision: expectedRevision + 1 },
      };
    }),
    deleteModelProfile: vi.fn().mockResolvedValue({
      outcome: "deleted",
      profileId: profile.id,
    }),
    validateModelProfile: vi.fn(),
    saveApplicationModelDefault: vi.fn().mockImplementation(async (value) => ({
      outcome: "saved",
      preference: {
        ...value.preference,
        revision: value.expectedRevision + 1,
      },
    })),
  } as unknown as BusinessApi;
}

function renderSettingsPage(
  storage: Storage = window.localStorage,
  initialEntry = "/settings",
) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ThemeProvider storage={storage}>
        <LocalizationProvider storage={storage}>
          <ToastProvider>
            <SettingsPage />
          </ToastProvider>
        </LocalizationProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

function renderModelSettingsPage(storage: Storage = window.localStorage) {
  return renderSettingsPage(storage, "/settings?section=models");
}

function storageWithLocale(locale: "en" | "ja"): Storage {
  return {
    getItem: vi.fn(() => JSON.stringify({ version: 1, locale })),
    setItem: vi.fn(),
  } as unknown as Storage;
}

describe("SettingsPage", () => {
  afterEach(() => {
    delete window.realmflow;
  });

  it("uses contained and split shared page modes for settings sections", () => {
    window.realmflow = {
      business: createBusiness(),
    } as unknown as typeof window.realmflow;

    const general = renderSettingsPage();
    expect(general.container.firstElementChild).toHaveClass("settings-page");
    expect(general.container.firstElementChild).not.toHaveClass("ui-page");
    expect(general.container.querySelector(".settings-content")).toHaveClass(
      "ui-page__body",
      "ui-page__body--contained",
    );
    general.unmount();

    const models = renderModelSettingsPage();
    expect(models.container.querySelector(".settings-content")).toHaveClass(
      "ui-page__body",
      "ui-page__body--split",
    );
  });

  it("uses the shared inline alert for settings failures", async () => {
    renderSettingsPage();

    expect(await screen.findByRole("alert")).toHaveClass(
      "ui-inline-alert",
      "ui-inline-alert--danger",
    );
  });

  it("shows general settings as the default section", async () => {
    const business = createBusiness();
    window.realmflow = { business } as unknown as typeof window.realmflow;

    renderSettingsPage();

    expect(
      screen.queryByRole("navigation", { name: "设置分类" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "通用", level: 2 })).toHaveClass(
      "settings-page-header-title",
    );
    expect(screen.getByRole("toolbar", { name: "通用" })).toHaveClass(
      "ui-toolbar",
      "ui-toolbar--workspace-header",
    );
    expect(document.querySelector(".settings-content-heading")).toBeNull();
    expect(
      screen.getByRole("heading", { name: "应用工作文件夹" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "供应商" }),
    ).not.toBeInTheDocument();
    await screen.findByText(currentWorkRoot.path);
  });

  it("localizes the general settings content in English", async () => {
    const business = createBusiness();
    window.realmflow = { business } as unknown as typeof window.realmflow;

    renderSettingsPage(storageWithLocale("en"));

    expect(
      screen.getByRole("heading", { name: "Application work folder" }),
    ).toBeVisible();
    expect(await screen.findByText(currentWorkRoot.path)).toBeVisible();
  });

  it("keeps theme and language controls out of general settings", () => {
    const business = createBusiness();
    window.realmflow = { business } as unknown as typeof window.realmflow;
    renderSettingsPage();

    expect(
      screen.queryByRole("radiogroup", { name: "界面语言" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("radiogroup", { name: "界面主题" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "应用工作文件夹" }),
    ).toBeVisible();
  });

  it("shows enabled models grouped by provider as application defaults", async () => {
    const business = createBusiness();
    window.realmflow = { business } as unknown as typeof window.realmflow;

    renderSettingsPage();

    const selector = await screen.findByRole("combobox", {
      name: "应用默认模型",
    });
    expect(selector).toHaveValue("auto");
    expect(selector).toHaveAttribute("name", "application-default-model");
    expect(selector).toHaveAttribute("autocomplete", "off");
    expect(selector.closest(".ui-field")).toHaveClass(
      "settings-default-model-field",
    );
    expect(
      await screen.findByRole("group", { name: provider.name }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: profile.displayName }),
    ).toHaveValue(profile.id);
  });

  it("updates the application default only after Main confirms the save", async () => {
    const business = createBusiness();
    let resolveSave:
      | ((
          value: Awaited<
            ReturnType<BusinessApi["saveApplicationModelDefault"]>
          >,
        ) => void)
      | undefined;
    vi.mocked(business.saveApplicationModelDefault).mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );
    window.realmflow = { business } as unknown as typeof window.realmflow;

    renderSettingsPage();

    const selector = await screen.findByRole("combobox", {
      name: "应用默认模型",
    });
    fireEvent.change(selector, { target: { value: profile.id } });

    expect(business.saveApplicationModelDefault).toHaveBeenCalledWith({
      preference: {
        mode: "profile",
        providerId: provider.id,
        profileId: profile.id,
      },
      expectedRevision: 1,
    });
    expect(selector).toHaveValue("auto");
    expect(selector).toBeDisabled();

    resolveSave?.({
      outcome: "saved",
      preference: {
        mode: "profile",
        providerId: provider.id,
        profileId: profile.id,
        revision: 2,
      },
    });

    await waitFor(() => expect(selector).toHaveValue(profile.id));
    expect(selector).toBeEnabled();
  });

  it("opens model settings directly from its section URL", async () => {
    const business = createBusiness();
    window.realmflow = { business } as unknown as typeof window.realmflow;

    renderModelSettingsPage();

    expect(
      screen.getByRole("heading", { name: "模型配置", level: 2 }),
    ).toHaveClass("settings-page-header-title");
    expect(
      screen.queryByRole("heading", { name: "供应商" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("searchbox", { name: "搜索供应商" }),
    ).not.toBeInTheDocument();
    await screen.findByRole("button", { name: "选择供应商 OpenAI" });
    expect(screen.getByRole("heading", { name: "模型档案" })).toBeVisible();
    expect(
      screen.getByRole("region", { name: "模型" }).closest(".settings-content"),
    ).toHaveClass("settings-content-models");
    expect(
      screen.queryByRole("heading", { name: "应用工作文件夹" }),
    ).not.toBeInTheDocument();
  });

  it("opens the builtin provider picker without discovering saved credentials", async () => {
    const discoverModelProviders = vi.fn().mockResolvedValue({
      failed: false,
      providers: [{ catalogId: "openai", credentialDetected: true }],
    });
    const business = {
      ...createBusiness(),
      discoverModelProviders,
    } as unknown as BusinessApi;
    window.realmflow = { business } as unknown as typeof window.realmflow;

    renderModelSettingsPage();
    fireEvent.click(await screen.findByRole("button", { name: "添加供应商" }));

    expect(discoverModelProviders).not.toHaveBeenCalled();
    expect(
      screen.getByRole("dialog", { name: "添加模型供应商" }),
    ).toBeVisible();
  });

  it("falls back to general settings for the removed permissions URL", async () => {
    const business = createBusiness();
    window.realmflow = { business } as unknown as typeof window.realmflow;

    renderSettingsPage(window.localStorage, "/settings?section=permissions");

    expect(
      await screen.findByRole("heading", { name: "应用工作文件夹" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("navigation", { name: "设置分类" }),
    ).not.toBeInTheDocument();
  });

  it("opens backup settings directly from its section URL", async () => {
    const business = createBusiness();
    window.realmflow = { business } as unknown as typeof window.realmflow;

    renderSettingsPage(window.localStorage, "/settings?section=backup");

    expect(
      await screen.findByRole("heading", { name: "创建本地备份" }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "从备份恢复" })).toBeVisible();
  });

  it("opens Main-owned web provider settings from its section URL", async () => {
    const business = createBusiness();
    window.realmflow = {
      business,
      webProviders: {
        get: vi.fn().mockResolvedValue({
          revision: 0, searchProvider: "disabled", searxngBaseUrl: "",
          hasBraveCredential: false, browserContinuation: false,
        }),
        save: vi.fn(),
      },
    } as unknown as typeof window.realmflow;
    renderSettingsPage(window.localStorage, "/settings?section=web");
    expect(await screen.findByLabelText("搜索供应商")).toHaveValue("disabled");
  });

  it("falls back from removed settings sections without loading their data", async () => {
    const business = createBusiness();
    window.realmflow = { business } as unknown as typeof window.realmflow;

    renderSettingsPage(window.localStorage, "/settings?section=connectors");

    expect(
      await screen.findByRole("heading", { name: "应用工作文件夹" }),
    ).toBeVisible();
    expect(business.listConnectors).not.toHaveBeenCalled();
    expect(business.listSpaces).not.toHaveBeenCalled();
  });

  it("loads and displays the current work root", async () => {
    const business = createBusiness();
    window.realmflow = { business } as unknown as typeof window.realmflow;

    renderSettingsPage();

    expect(await screen.findByText(currentWorkRoot.path)).toBeInTheDocument();
    expect(business.listWorkRoots).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("heading", { name: "历史工作文件夹" }),
    ).not.toBeInTheDocument();
  });

  it("displays registered historical work roots separately", async () => {
    const business = createBusiness([currentWorkRoot, historicalWorkRoot]);
    window.realmflow = { business } as unknown as typeof window.realmflow;

    renderSettingsPage();

    expect(
      await screen.findByRole("heading", { name: "历史工作文件夹" }),
    ).toBeVisible();
    expect(screen.getByText(historicalWorkRoot.path)).toBeVisible();
  });

  it("updates the displayed path after choosing another work root", async () => {
    const business = createBusiness();
    const nextWorkRoot = {
      ...currentWorkRoot,
      id: "root-2",
      path: "/Users/test/NextRoot",
      revision: 1,
    };
    vi.mocked(business.chooseWorkRoot).mockResolvedValue(nextWorkRoot);
    window.realmflow = { business } as unknown as typeof window.realmflow;
    renderSettingsPage();

    await screen.findByText(currentWorkRoot.path);
    fireEvent.click(screen.getByRole("button", { name: "更换工作文件夹" }));

    expect(await screen.findByText(nextWorkRoot.path)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "历史工作文件夹" }),
    ).toBeVisible();
    expect(screen.getByText(currentWorkRoot.path)).toBeVisible();
  });

  it("keeps the current path when choosing a work root is cancelled", async () => {
    const business = createBusiness();
    window.realmflow = { business } as unknown as typeof window.realmflow;
    renderSettingsPage();

    await screen.findByText(currentWorkRoot.path);
    fireEvent.click(screen.getByRole("button", { name: "更换工作文件夹" }));

    await waitFor(() => expect(business.chooseWorkRoot).toHaveBeenCalledOnce());
    expect(screen.getByText(currentWorkRoot.path)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps the current path and reports a work root selection failure", async () => {
    const business = createBusiness();
    vi.mocked(business.chooseWorkRoot).mockRejectedValue(
      new Error("sensitive path: /Users/private"),
    );
    window.realmflow = { business } as unknown as typeof window.realmflow;
    renderSettingsPage();

    await screen.findByText(currentWorkRoot.path);
    fireEvent.click(screen.getByRole("button", { name: "更换工作文件夹" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "工作文件夹选择失败",
    );
    expect(screen.queryByText(/sensitive path/)).not.toBeInTheDocument();
    expect(document.querySelector(".model-page-error")).toBeNull();
    expect(screen.getByText(currentWorkRoot.path)).toBeInTheDocument();
  });

  it("publishes provider save failures without exposing the raw exception", async () => {
    const business = createBusiness();
    vi.mocked(business.saveModelProvider).mockRejectedValue(
      new Error("token=private-provider-token"),
    );
    window.realmflow = { business } as unknown as typeof window.realmflow;
    renderModelSettingsPage();
    await screen.findByText("OpenAI");
    fireEvent.click(screen.getByRole("button", { name: "编辑供应商 OpenAI" }));
    fireEvent.click(screen.getByRole("button", { name: "保存供应商" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "供应商保存失败",
    );
    expect(
      screen.queryByText(/private-provider-token/),
    ).not.toBeInTheDocument();
    expect(document.querySelector(".model-page-error")).toBeNull();
  });

  it("creates a provider and stores its API key separately", async () => {
    const business = createBusiness();
    window.realmflow = { business } as unknown as typeof window.realmflow;
    renderModelSettingsPage();
    await screen.findByText("OpenAI");
    fireEvent.click(screen.getByRole("button", { name: "添加供应商" }));
    fireEvent.click(screen.getByRole("button", { name: "自定义供应商" }));
    fireEvent.change(screen.getByRole("textbox", { name: "供应商名称" }), {
      target: { value: "Local gateway" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "基础地址" }), {
      target: { value: "http://localhost:11434/v1" },
    });
    fireEvent.change(screen.getByLabelText("API Key"), {
      target: { value: "secret-key" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存供应商" }));

    await waitFor(() =>
      expect(business.saveModelProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          id: expect.any(String),
          type: "openai_completions",
          name: "Local gateway",
          baseUrl: "http://localhost:11434/v1",
          enabled: true,
          expectedRevision: 0,
        }),
      ),
    );
    expect(business.saveModelProvider).toHaveBeenCalledWith(
      expect.objectContaining({ credential: "secret-key" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Local gateway" }),
    ).toBeVisible();
  });

  it("configures a builtin provider and default model only after Main succeeds", async () => {
    const business = createBusiness();
    let resolveConfiguration:
      | ((
          value: Awaited<
            ReturnType<BusinessApi["configureBuiltinModelProvider"]>
          >,
        ) => void)
      | undefined;
    vi.mocked(business.configureBuiltinModelProvider).mockReturnValue(
      new Promise((resolve) => {
        resolveConfiguration = resolve;
      }),
    );
    window.realmflow = { business } as unknown as typeof window.realmflow;
    renderModelSettingsPage();
    await screen.findByText("OpenAI");
    fireEvent.click(screen.getByRole("button", { name: "添加供应商" }));
    fireEvent.click(
      screen.getByRole("button", { name: "选择供应商 DeepSeek" }),
    );
    fireEvent.change(screen.getByLabelText("API Key"), {
      target: { value: "sk-deepseek" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存并启用" }));

    expect(business.configureBuiltinModelProvider).toHaveBeenCalledWith({
      catalogId: "deepseek",
      credential: "sk-deepseek",
    });
    expect(
      screen.queryByRole("button", { name: "选择供应商 DeepSeek" }),
    ).not.toBeInTheDocument();

    resolveConfiguration?.({
      outcome: "configured",
      provider: {
        id: "builtin-deepseek",
        type: "openai_completions",
        name: "DeepSeek",
        baseUrl: "https://api.deepseek.com",
        enabled: true,
        revision: 1,
      },
      profiles: [
        {
          id: "builtin-deepseek-default",
          providerId: "builtin-deepseek",
          modelId: "deepseek-v4-flash",
          displayName: "DeepSeek V4 Flash",
          enabled: true,
          capabilities: {
            text: true,
            vision: false,
            toolCalling: true,
            structuredOutput: true,
          },
          contextWindow: 1_000_000,
          timeoutMs: 120_000,
          maxRetries: 2,
          maxConcurrency: 2,
          inputCostPerMillionTokens: 0,
          outputCostPerMillionTokens: 0,
          revision: 1,
        },
      ],
    });

    expect(
      await screen.findByRole("button", { name: "选择供应商 DeepSeek" }),
    ).toHaveAttribute("aria-current", "true");
    expect(screen.getByText("DeepSeek V4 Flash")).toBeVisible();
  });

  it("edits a provider without echoing or overwriting its saved credential", async () => {
    const business = createBusiness();
    window.realmflow = { business } as unknown as typeof window.realmflow;
    renderModelSettingsPage();
    await screen.findByText("OpenAI");
    fireEvent.click(screen.getByRole("button", { name: "编辑供应商 OpenAI" }));

    const credential = screen.getByLabelText("API Key");
    expect(credential).toHaveAttribute("type", "password");
    expect(credential).toHaveValue("");

    fireEvent.change(screen.getByRole("textbox", { name: "供应商名称" }), {
      target: { value: "OpenAI production" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存供应商" }));

    await waitFor(() =>
      expect(business.saveModelProvider).toHaveBeenCalledWith({
        id: provider.id,
        type: provider.type,
        name: "OpenAI production",
        baseUrl: provider.baseUrl,
        enabled: true,
        customHeaders: [],
        expectedRevision: provider.revision,
      }),
    );
    expect(business.saveModelProvider).toHaveBeenCalledWith(
      expect.not.objectContaining({ credential: expect.anything() }),
    );
  });

  it("removes a provider credential only after Main confirms the change", async () => {
    const business = createBusiness();
    let resolveRemoval:
      | ((
          value: Awaited<
            ReturnType<BusinessApi["removeModelProviderCredential"]>
          >,
        ) => void)
      | undefined;
    vi.mocked(business.removeModelProviderCredential).mockReturnValue(
      new Promise((resolve) => {
        resolveRemoval = resolve;
      }),
    );
    window.realmflow = { business } as unknown as typeof window.realmflow;
    renderModelSettingsPage();
    await screen.findByText("凭据已配置");
    const remove = screen.getByRole("button", { name: "移除供应商凭据" });
    fireEvent.click(remove);

    expect(business.removeModelProviderCredential).toHaveBeenCalledWith({
      providerId: provider.id,
      expectedRevision: provider.revision,
    });
    expect(screen.getByText("凭据已配置")).toBeVisible();

    await act(async () => {
      resolveRemoval?.({
        outcome: "saved",
        provider: {
          ...provider,
          revision: provider.revision + 1,
          credentialConfigured: false,
          customHeaderNames: [],
        },
      });
    });

    expect(await screen.findByText("凭据未配置")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "移除供应商凭据" }),
    ).not.toBeInTheDocument();
  });

  it("rotates the credential key without optimistic success", async () => {
    const business = createBusiness();
    let resolveRotation:
      | ((
          value: Awaited<ReturnType<BusinessApi["rotateModelCredentialKey"]>>,
        ) => void)
      | undefined;
    vi.mocked(business.rotateModelCredentialKey).mockReturnValue(
      new Promise((resolve) => {
        resolveRotation = resolve;
      }),
    );
    window.realmflow = { business } as unknown as typeof window.realmflow;
    renderModelSettingsPage();
    await screen.findByText("OpenAI");

    const rotate = screen.getByRole("button", { name: "轮换加密密钥" });
    fireEvent.click(rotate);

    expect(rotate).toBeDisabled();
    expect(business.rotateModelCredentialKey).toHaveBeenCalledWith({
      requestId: expect.any(String),
    });
    expect(screen.queryByText(/密钥已轮换/)).not.toBeInTheDocument();

    resolveRotation?.({
      outcome: "rotated",
      requestId: "rotation-request-1",
      fromKeyVersion: 1,
      toKeyVersion: 2,
      credentialCount: 1,
      rotatedAt: 500,
    });
    expect(
      await screen.findByText("密钥已轮换至版本 2，共更新 1 个凭据"),
    ).toBeVisible();
    expect(rotate).toBeEnabled();
  });

  it("reports credential key rotation failure without showing success", async () => {
    const business = createBusiness();
    vi.mocked(business.rotateModelCredentialKey).mockRejectedValue(
      new Error("keyring path: /Users/private/keyring"),
    );
    window.realmflow = { business } as unknown as typeof window.realmflow;
    renderModelSettingsPage();
    await screen.findByText("OpenAI");

    fireEvent.click(screen.getByRole("button", { name: "轮换加密密钥" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "无法完成模型凭据密钥轮换，请重试",
    );
    expect(screen.queryByText(/keyring path/)).not.toBeInTheDocument();
    expect(document.querySelector(".model-page-error")).toBeNull();
    expect(screen.queryByText(/密钥已轮换/)).not.toBeInTheDocument();
  });

  it("invalidates a restored availability result after provider revision changes", async () => {
    const business = createBusiness();
    vi.mocked(business.listModels).mockResolvedValue({
      providers: [provider],
      profiles: [
        {
          ...profile,
          availability: {
            id: "check-available",
            requestId: "request-available",
            providerId: provider.id,
            profileId: profile.id,
            providerRevision: provider.revision,
            profileRevision: profile.revision,
            status: "available",
            checkedCapabilities: ["text"],
            missingCapabilities: [],
            latencyMs: 6,
            message: "Model is available",
            checkedAt: 1_700_000_000_000,
            triggerSource: "user",
          },
        },
      ],
    });
    window.realmflow = { business } as unknown as typeof window.realmflow;
    renderModelSettingsPage();
    expect(await screen.findByText(/可用 · 6 ms/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "编辑供应商 OpenAI" }));
    fireEvent.change(screen.getByRole("textbox", { name: "供应商名称" }), {
      target: { value: "OpenAI production" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存供应商" }));

    expect(await screen.findByText("未验证")).toBeVisible();
    expect(screen.queryByText(/可用 · 6 ms/)).not.toBeInTheDocument();
  });

  it("creates and edits model profiles", async () => {
    const business = createBusiness();
    window.realmflow = { business } as unknown as typeof window.realmflow;
    renderModelSettingsPage();
    await screen.findByText("GPT 4.1");
    fireEvent.click(screen.getByRole("button", { name: "添加模型" }));
    fireEvent.change(screen.getByRole("textbox", { name: "显示名称" }), {
      target: { value: "GPT 4.1 mini" },
    });
    fireEvent.change(
      screen.getByRole("textbox", { name: "模型 ID / 推理接入点 ID" }),
      {
        target: { value: "gpt-4.1-mini" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "保存模型" }));

    await waitFor(() =>
      expect(business.saveModelProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          id: expect.any(String),
          providerId: provider.id,
          modelId: "gpt-4.1-mini",
          displayName: "GPT 4.1 mini",
          expectedRevision: 0,
        }),
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "编辑模型 GPT 4.1" }));
    fireEvent.change(screen.getByRole("textbox", { name: "显示名称" }), {
      target: { value: "GPT 4.1 primary" },
    });
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "请求超时（毫秒）" }),
      {
        target: { value: "90000" },
      },
    );
    fireEvent.change(screen.getByRole("spinbutton", { name: "最大重试次数" }), {
      target: { value: "3" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "最大并发数" }), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存模型" }));

    await waitFor(() =>
      expect(business.saveModelProfile).toHaveBeenLastCalledWith({
        id: profile.id,
        providerId: profile.providerId,
        modelId: profile.modelId,
        displayName: "GPT 4.1 primary",
        enabled: true,
        capabilities: profile.capabilities,
        contextWindow: profile.contextWindow,
        timeoutMs: 90_000,
        maxRetries: 3,
        maxConcurrency: 2,
        inputCostPerMillionTokens: profile.inputCostPerMillionTokens,
        outputCostPerMillionTokens: profile.outputCostPerMillionTokens,
        expectedRevision: profile.revision,
      }),
    );
  });

  it("toggles a profile only after Main confirms the save", async () => {
    const business = createBusiness();
    let resolveSave:
      | ((value: Awaited<ReturnType<BusinessApi["saveModelProfile"]>>) => void)
      | undefined;
    vi.mocked(business.saveModelProfile).mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );
    window.realmflow = { business } as unknown as typeof window.realmflow;
    renderModelSettingsPage();
    await screen.findByText("GPT 4.1");
    fireEvent.click(screen.getByRole("switch", { name: "停用模型 GPT 4.1" }));

    expect(
      screen.getByRole("switch", { name: "停用模型 GPT 4.1" }),
    ).toHaveAttribute("aria-checked", "true");
    resolveSave?.({
      outcome: "saved",
      profile: { ...profile, enabled: false, revision: 3 },
    });
    await waitFor(() =>
      expect(
        screen.getByRole("switch", { name: "启用模型 GPT 4.1" }),
      ).toHaveAttribute("aria-checked", "false"),
    );
    expect(business.saveModelProfile).toHaveBeenCalledWith({
      ...profile,
      enabled: false,
      expectedRevision: profile.revision,
      revision: undefined,
    });
  });

  it("bulk-disables provider profiles only after Main confirms the transaction", async () => {
    const business = createBusiness();
    let resolveBulk:
      | ((value: {
          outcome: "saved";
          provider: typeof provider;
          profiles: Array<typeof profile>;
        }) => void)
      | undefined;
    const setModelProfilesEnabled = vi.fn(
      () =>
        new Promise<{
          outcome: "saved";
          provider: typeof provider;
          profiles: Array<typeof profile>;
        }>((resolve) => {
          resolveBulk = resolve;
        }),
    );
    Object.assign(business, { setModelProfilesEnabled });
    window.realmflow = { business } as unknown as typeof window.realmflow;
    renderModelSettingsPage();
    await screen.findByText("GPT 4.1");
    fireEvent.click(screen.getByRole("button", { name: "模型批量操作" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "全部禁用" }));

    expect(setModelProfilesEnabled).toHaveBeenCalledWith({
      providerId: provider.id,
      expectedProviderRevision: provider.revision,
      profiles: [{ id: profile.id, expectedRevision: profile.revision }],
      enabled: false,
    });
    expect(
      screen.getByRole("switch", { name: "停用模型 GPT 4.1" }),
    ).toHaveAttribute("aria-checked", "true");

    resolveBulk?.({
      outcome: "saved",
      provider,
      profiles: [{ ...profile, enabled: false, revision: 3 }],
    });
    await waitFor(() =>
      expect(
        screen.getByRole("switch", { name: "启用模型 GPT 4.1" }),
      ).toHaveAttribute("aria-checked", "false"),
    );
    await waitFor(() =>
      expect(business.listEffectiveModels).toHaveBeenCalledTimes(2),
    );
  });

  it("shows per-profile validating state and committed success", async () => {
    const business = createBusiness();
    let resolveValidation:
      | ((
          value: Awaited<ReturnType<BusinessApi["validateModelProfile"]>>,
        ) => void)
      | undefined;
    vi.mocked(business.validateModelProfile).mockReturnValue(
      new Promise((resolve) => {
        resolveValidation = resolve;
      }),
    );
    window.realmflow = { business } as unknown as typeof window.realmflow;
    renderModelSettingsPage();
    await screen.findByText("GPT 4.1");

    const validate = screen.getByRole("button", {
      name: "验证模型 GPT 4.1",
    });
    fireEvent.click(validate);

    expect(validate).toBeDisabled();
    expect(screen.getByText("验证中")).toBeVisible();
    expect(business.validateModelProfile).toHaveBeenCalledWith({
      profileId: profile.id,
      requestId: expect.any(String),
    });
    resolveValidation?.({
      outcome: "checked",
      check: {
        id: "check-1",
        requestId: "request-1",
        providerId: provider.id,
        profileId: profile.id,
        providerRevision: provider.revision,
        profileRevision: profile.revision,
        status: "available",
        checkedCapabilities: ["text"],
        missingCapabilities: [],
        latencyMs: 32,
        message: "Model is available",
        checkedAt: 1_700_000_000_000,
        triggerSource: "user",
      },
    });

    expect(await screen.findByText(/可用 · 32 ms/)).toBeVisible();
    expect(validate).toBeEnabled();
  });

  it("keeps the model list order after validating a profile", async () => {
    const secondProfile = {
      ...profile,
      id: "profile-2",
      modelId: "gpt-4.1-mini",
      displayName: "GPT 4.1 mini",
      revision: 1,
    };
    const business = createBusiness();
    vi.mocked(business.listModels).mockResolvedValue({
      providers: [provider],
      profiles: [profile, secondProfile],
    });
    vi.mocked(business.validateModelProfile).mockResolvedValue({
      outcome: "checked",
      check: {
        id: "check-first",
        requestId: "request-first",
        providerId: provider.id,
        profileId: profile.id,
        providerRevision: provider.revision,
        profileRevision: profile.revision,
        status: "available",
        checkedCapabilities: ["text"],
        missingCapabilities: [],
        latencyMs: 20,
        message: "Model is available",
        checkedAt: 1_700_000_000_000,
        triggerSource: "user",
      },
    });
    window.realmflow = { business } as unknown as typeof window.realmflow;
    renderModelSettingsPage();
    await screen.findByText("GPT 4.1 mini");

    fireEvent.click(screen.getByRole("button", { name: "验证模型 GPT 4.1" }));

    await screen.findByRole("button", { name: "重新验证模型 GPT 4.1" });
    expect(
      screen
        .getAllByRole("button", { name: /验证模型/ })
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["重新验证模型 GPT 4.1", "验证模型 GPT 4.1 mini"]);
  });

  it("tracks concurrent connection tests independently per model", async () => {
    const secondProfile = {
      ...profile,
      id: "profile-2",
      modelId: "gpt-4.1-mini",
      displayName: "GPT 4.1 mini",
      revision: 1,
    };
    const business = createBusiness();
    vi.mocked(business.listModels).mockResolvedValue({
      providers: [provider],
      profiles: [profile, secondProfile],
    });
    const pending = new Map<
      string,
      (value: Awaited<ReturnType<BusinessApi["validateModelProfile"]>>) => void
    >();
    vi.mocked(business.validateModelProfile).mockImplementation(
      ({ profileId }) =>
        new Promise((resolve) => {
          pending.set(profileId, resolve);
        }),
    );
    window.realmflow = { business } as unknown as typeof window.realmflow;
    renderModelSettingsPage();
    await screen.findByText("GPT 4.1 mini");

    const first = screen.getByRole("button", {
      name: "验证模型 GPT 4.1",
    });
    const second = screen.getByRole("button", {
      name: "验证模型 GPT 4.1 mini",
    });
    fireEvent.click(first);
    fireEvent.click(second);

    expect(first).toBeDisabled();
    expect(second).toBeDisabled();
    expect(screen.getAllByText("验证中")).toHaveLength(2);

    pending.get(profile.id)?.({
      outcome: "checked",
      check: {
        id: "check-first",
        requestId: "request-first",
        providerId: provider.id,
        profileId: profile.id,
        providerRevision: provider.revision,
        profileRevision: profile.revision,
        status: "available",
        checkedCapabilities: ["text"],
        missingCapabilities: [],
        latencyMs: 20,
        message: "Model is available",
        checkedAt: 1_700_000_000_000,
        triggerSource: "user",
      },
    });

    await waitFor(() => expect(first).toBeEnabled());
    expect(second).toBeDisabled();
    expect(screen.getAllByText("验证中")).toHaveLength(1);
  });

  it("renders restored categorized failures and allows retry", async () => {
    const business = createBusiness();
    vi.mocked(business.listModels).mockResolvedValue({
      providers: [provider],
      profiles: [
        {
          ...profile,
          availability: {
            id: "check-auth",
            requestId: "request-auth",
            providerId: provider.id,
            profileId: profile.id,
            providerRevision: provider.revision,
            profileRevision: profile.revision,
            status: "authentication_error",
            checkedCapabilities: ["text"],
            missingCapabilities: [],
            latencyMs: 20,
            message: "Provider authentication failed",
            checkedAt: 1_700_000_000_000,
            triggerSource: "user",
          },
        },
      ],
    });
    vi.mocked(business.validateModelProfile).mockResolvedValue({
      outcome: "not_found",
      profileId: profile.id,
    });
    window.realmflow = { business } as unknown as typeof window.realmflow;
    renderModelSettingsPage();

    expect(await screen.findByText(/认证失败/)).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "重新验证模型 GPT 4.1" }),
    );
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("模型档案或供应商已不存在");
    expect(alert).toHaveClass("toast-message");
    expect(document.querySelector(".model-page-error")).toBeNull();
  });

  it("shows stale validation without replacing the committed current status", async () => {
    const business = createBusiness();
    vi.mocked(business.validateModelProfile).mockResolvedValue({
      outcome: "stale",
      check: {
        id: "check-stale",
        requestId: "request-stale",
        providerId: provider.id,
        profileId: profile.id,
        providerRevision: provider.revision,
        profileRevision: profile.revision,
        status: "available",
        checkedCapabilities: ["text"],
        missingCapabilities: [],
        latencyMs: 12,
        message: "Model is available",
        checkedAt: 1_700_000_000_000,
        triggerSource: "user",
      },
      profile: { ...profile, displayName: "Changed", revision: 3 },
    });
    window.realmflow = { business } as unknown as typeof window.realmflow;
    renderModelSettingsPage();
    await screen.findByText("GPT 4.1");

    fireEvent.click(screen.getByRole("button", { name: "验证模型 GPT 4.1" }));

    expect(await screen.findByText("配置已变化，请重新验证")).toBeVisible();
    expect(screen.queryByText(/可用 · 12 ms/)).not.toBeInTheDocument();
  });

  it("disables validation when the profile or provider is disabled", async () => {
    const business = createBusiness();
    vi.mocked(business.listModels).mockResolvedValue({
      providers: [{ ...provider, enabled: false }],
      profiles: [profile],
    });
    window.realmflow = { business } as unknown as typeof window.realmflow;
    renderModelSettingsPage();

    expect(
      await screen.findByRole("button", { name: "验证模型 GPT 4.1" }),
    ).toBeDisabled();
    expect(screen.getByText("需先启用模型和供应商")).toBeVisible();
    expect(business.validateModelProfile).not.toHaveBeenCalled();
  });

  it("keeps a referenced profile and reports its reference summary", async () => {
    const business = createBusiness();
    vi.mocked(business.deleteModelProfile).mockResolvedValue({
      outcome: "referenced",
      profile,
      references: {
        workflowCount: 2,
        runCount: 1,
        conversationCount: 0,
        metricCount: 3,
      },
    });
    window.realmflow = { business } as unknown as typeof window.realmflow;
    renderModelSettingsPage();
    await screen.findByText("GPT 4.1");
    fireEvent.click(screen.getByRole("button", { name: "删除模型 GPT 4.1" }));
    expect(screen.getByRole("dialog", { name: "删除模型" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "确认删除模型" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("2 个流程、1 个运行和 3 条调用记录");
    expect(alert).toHaveClass("model-page-error");
    expect(document.querySelector(".toast-message")).toBeNull();
    expect(screen.getByText("GPT 4.1")).toBeVisible();
  });

  it("toggles a provider only after Main confirms the save", async () => {
    const business = createBusiness();
    let resolveSave:
      | ((value: Awaited<ReturnType<BusinessApi["saveModelProvider"]>>) => void)
      | undefined;
    vi.mocked(business.saveModelProvider).mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );
    window.realmflow = { business } as unknown as typeof window.realmflow;
    renderModelSettingsPage();
    await screen.findByText("OpenAI");
    fireEvent.click(screen.getByRole("switch", { name: "停用供应商 OpenAI" }));

    expect(
      screen.getByRole("switch", { name: "停用供应商 OpenAI" }),
    ).toHaveAttribute("aria-checked", "true");
    resolveSave?.({
      outcome: "saved",
      provider: { ...provider, enabled: false, revision: 4 },
    });
    await waitFor(() =>
      expect(
        screen.getByRole("switch", { name: "启用供应商 OpenAI" }),
      ).toHaveAttribute("aria-checked", "false"),
    );
    expect(business.saveModelProvider).toHaveBeenCalledWith({
      id: provider.id,
      type: provider.type,
      name: provider.name,
      baseUrl: provider.baseUrl,
      enabled: false,
      expectedRevision: provider.revision,
    });
  });

  it("confirms and deletes an unreferenced provider", async () => {
    const business = createBusiness();
    window.realmflow = { business } as unknown as typeof window.realmflow;
    renderModelSettingsPage();
    await screen.findByText("OpenAI");
    fireEvent.click(screen.getByRole("button", { name: "删除供应商 OpenAI" }));

    expect(screen.getByRole("dialog", { name: "删除供应商" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

    await waitFor(() =>
      expect(business.deleteModelProvider).toHaveBeenCalledWith({
        id: provider.id,
        expectedRevision: provider.revision,
      }),
    );
    await waitFor(() =>
      expect(screen.queryByText("OpenAI")).not.toBeInTheDocument(),
    );
  });

  it("selects the adjacent provider after deleting the current provider", async () => {
    const deepSeekProvider = {
      ...provider,
      id: "provider-2",
      name: "DeepSeek",
      baseUrl: "https://api.deepseek.com",
      revision: 1,
    };
    const business = createBusiness();
    vi.mocked(business.listModels).mockResolvedValue({
      providers: [provider, deepSeekProvider],
      profiles: [profile],
    });
    vi.mocked(business.deleteModelProvider).mockResolvedValue({
      outcome: "deleted",
      providerId: deepSeekProvider.id,
    });
    window.realmflow = { business } as unknown as typeof window.realmflow;
    renderModelSettingsPage();
    fireEvent.click(
      await screen.findByRole("button", { name: "选择供应商 DeepSeek" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "删除供应商 DeepSeek" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "选择供应商 OpenAI" }),
      ).toHaveAttribute("aria-current", "true"),
    );
  });

  it("removes builtin provider profiles from renderer state after deletion", async () => {
    const builtinProvider = {
      ...provider,
      id: "builtin-deepseek",
      name: "DeepSeek",
      baseUrl: "https://api.deepseek.com",
      revision: 1,
    };
    const builtinProfile = {
      ...profile,
      id: "builtin-deepseek-default",
      providerId: builtinProvider.id,
      modelId: "deepseek-v4-flash",
      displayName: "DeepSeek V4 Flash",
      revision: 1,
    };
    const business = createBusiness();
    vi.mocked(business.listModels).mockResolvedValue({
      providers: [provider, builtinProvider],
      profiles: [profile, builtinProfile],
    });
    vi.mocked(business.deleteModelProvider).mockResolvedValue({
      outcome: "deleted",
      providerId: builtinProvider.id,
    });
    vi.mocked(business.configureBuiltinModelProvider).mockResolvedValue({
      outcome: "configured",
      provider: builtinProvider,
      profiles: [],
    });
    window.realmflow = { business } as unknown as typeof window.realmflow;
    renderModelSettingsPage();
    fireEvent.click(
      await screen.findByRole("button", { name: "选择供应商 DeepSeek" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "删除供应商 DeepSeek" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "选择供应商 DeepSeek" }),
      ).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "添加供应商" }));
    fireEvent.click(
      screen.getByRole("button", { name: "选择供应商 DeepSeek" }),
    );
    fireEvent.change(screen.getByLabelText("API Key"), {
      target: { value: "replacement-secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存并启用" }));
    await screen.findByRole("heading", { name: "DeepSeek" });
    expect(screen.queryByText("DeepSeek V4 Flash")).not.toBeInTheDocument();
  });

  it("keeps a referenced provider and reports the model count", async () => {
    const business = createBusiness();
    vi.mocked(business.deleteModelProvider).mockResolvedValue({
      outcome: "referenced",
      provider,
      profileCount: 1,
      references: {
        workflowCount: 1,
        runCount: 0,
        conversationCount: 0,
        metricCount: 0,
      },
    });
    window.realmflow = { business } as unknown as typeof window.realmflow;
    renderModelSettingsPage();
    await screen.findByText("OpenAI");
    fireEvent.click(screen.getByRole("button", { name: "删除供应商 OpenAI" }));
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("仍被 1 个模型档案引用");
    expect(alert).toHaveClass("model-page-error");
    expect(document.querySelector(".toast-message")).toBeNull();
    expect(screen.getByRole("heading", { name: "OpenAI" })).toBeVisible();
  });
});
