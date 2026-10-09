import {
  fireEvent,
  render as testingRender,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { BusinessApi } from "../../shared/business";
import type { ToolCatalogApi, ToolCatalogDto } from "../../shared/tool-catalog";
import { ToastProvider } from "../features/toast/ToastProvider";
import {
  LocalizationProvider,
  useLocalization,
} from "../localization/LocalizationProvider";
import CapabilitiesPage from "./CapabilitiesPage";

function render(
  ui: Parameters<typeof testingRender>[0],
): ReturnType<typeof testingRender> {
  return testingRender(
    <MemoryRouter initialEntries={["/capabilities"]}>{ui}</MemoryRouter>,
  );
}

describe("CapabilitiesPage", () => {
  afterEach(() => {
    delete window.realmflow;
  });

  it("restores the active tab from a deep link and rejects invalid values", async () => {
    setRealmflow(createToolCatalog());

    const page = renderPage("/capabilities?tab=skills");

    expect(screen.getByRole("tab", { name: "技能" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    page.unmount();
    renderPage("/capabilities?tab=unknown");

    expect(screen.getByRole("tab", { name: "工具" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("uses the shared wide page, toolbar, badges and empty state primitives", async () => {
    setRealmflow(createToolCatalog());
    const { container } = render(
      <LocalizationProvider>
        <ToastProvider>
          <CapabilitiesPage />
        </ToastProvider>
      </LocalizationProvider>,
    );

    expect(container.firstElementChild).toHaveClass("capabilities-page");
    expect(container.firstElementChild).not.toHaveClass("ui-page");
    expect(container.querySelector(".capabilities-content")).toHaveClass(
      "ui-page__body",
      "ui-page__body--wide",
    );
    expect(screen.getByRole("toolbar", { name: "搜索能力" })).toHaveClass(
      "ui-toolbar",
    );
    await screen.findByText("读取文件");
    expect(container.querySelector(".ui-badge--success")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "智能体" }));
    expect(
      screen.getByText("暂无智能体").closest(".ui-empty-state"),
    ).toBeTruthy();
  });

  it("reloads localized capability display text when the locale changes", async () => {
    const list = vi.fn(
      async ({ locale }: { locale: "zh-CN" | "en" | "ja" }) => {
        const catalog = catalogFixture();
        return {
          ...catalog,
          packages: catalog.packages.map((item) => ({
            ...item,
            display: {
              name: locale === "en" ? "Files" : "文件",
              description:
                locale === "en" ? "Local file capabilities" : "本地文件能力",
              requestedLocale: locale,
              resolvedLocale: locale,
            },
          })),
          tools: catalog.tools.map((item) => ({
            ...item,
            display: {
              name: locale === "en" ? "Read file" : "读取文件",
              description:
                locale === "en" ? "Read an authorized file" : "读取授权文件",
              requestedLocale: locale,
              resolvedLocale: locale,
            },
          })),
        };
      },
    );
    setRealmflow(createToolCatalog({ list }));

    testingRender(
      <MemoryRouter initialEntries={["/capabilities"]}>
        <LocalizationProvider>
          <LocaleSwitchingCapabilities />
        </LocalizationProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("读取文件")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "switch locale" }));
    expect(await screen.findByText("Read file")).toBeVisible();
    expect(list).toHaveBeenLastCalledWith({ locale: "en" });
  });

  it("uses the shared inline alert for page load failures", async () => {
    renderPage();

    expect(await screen.findByRole("alert")).toHaveClass(
      "ui-inline-alert",
      "ui-inline-alert--danger",
    );
  });

  it("shows four semantic tabs and keeps Connector transports out of Tools", async () => {
    const business = {
      listConnectors: vi.fn().mockResolvedValue([connectorFixture()]),
    } as unknown as BusinessApi;
    const toolCatalog = {
      list: vi.fn().mockResolvedValue(catalogFixture()),
      listMcpServers: vi.fn().mockResolvedValue([mcpServerFixture()]),
      chooseAndImport: vi.fn(),
      setActivation: vi.fn(),
    } as unknown as ToolCatalogApi;
    window.realmflow = { business, toolCatalog } as typeof window.realmflow;

    renderPage();

    const toolsTab = screen.getByRole("tab", { name: "工具" });
    const skillsTab = screen.getByRole("tab", { name: "技能" });
    const agentsTab = screen.getByRole("tab", { name: "智能体" });
    const connectorsTab = screen.getByRole("tab", { name: "连接器" });

    expect(screen.getByRole("tablist")).toHaveClass(
      "ui-tab-list",
      "ui-tab-list--page",
    );
    expect(screen.getByRole("tablist").parentElement).toHaveClass(
      "ui-tabs",
      "ui-tabs--page",
    );
    toolsTab.focus();
    fireEvent.keyDown(toolsTab, { key: "ArrowRight" });
    expect(skillsTab).toHaveFocus();
    expect(toolsTab).toHaveAttribute("aria-selected", "true");
    expect(toolsTab).toHaveAttribute("aria-selected", "true");
    expect(skillsTab).toHaveAttribute("aria-selected", "false");
    expect(agentsTab).toHaveAttribute("aria-selected", "false");
    expect(connectorsTab).toHaveAttribute("aria-selected", "false");
    await screen.findByText("读取文件");
    expect(screen.queryByText("Remote Search")).not.toBeInTheDocument();
    expect(screen.queryByText("Docs")).not.toBeInTheDocument();
    expect(screen.getByText("读取文件")).toBeVisible();
    expect(screen.queryByText("需求分析")).not.toBeInTheDocument();

    fireEvent.click(skillsTab);

    expect(toolsTab).toHaveAttribute("aria-selected", "false");
    expect(skillsTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("需求分析")).toBeVisible();
    expect(screen.queryByText("读取文件")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "HTTP 连接器" }),
    ).not.toBeInTheDocument();

    fireEvent.click(agentsTab);

    expect(toolsTab).toHaveAttribute("aria-selected", "false");
    expect(skillsTab).toHaveAttribute("aria-selected", "false");
    expect(agentsTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("暂无智能体")).toBeVisible();
    expect(screen.queryByText("需求分析")).not.toBeInTheDocument();
    expect(screen.queryByText("读取文件")).not.toBeInTheDocument();

    fireEvent.click(connectorsTab);

    expect(connectorsTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "全部" })).toBeVisible();
    expect(screen.getByRole("button", { name: "MCP" })).toBeVisible();
    expect(screen.getByRole("button", { name: "HTTP" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Database" })).toBeVisible();
    expect(screen.getByRole("button", { name: "CLI" })).toBeVisible();
    expect(screen.getByText("Remote Search")).toBeVisible();
    expect(screen.getByText("Docs")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "MCP" }));
    expect(screen.getByText("Remote Search")).toBeVisible();
    expect(screen.queryByText("Docs")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "HTTP" }));
    expect(screen.queryByText("Remote Search")).not.toBeInTheDocument();
    expect(screen.getByText("Docs")).toBeVisible();
    await waitFor(() => {
      expect(business.listConnectors).toHaveBeenCalledOnce();
      expect(toolCatalog.list).toHaveBeenCalledOnce();
    });
  });

  it("shows the builtin Web package and web Tools in the user-facing Tools catalog", async () => {
    const catalog = catalogFixture();
    setRealmflow(
      createToolCatalog({
        list: vi.fn().mockResolvedValue({
          ...catalog,
          packages: [
            ...catalog.packages,
            {
              packageId: "realmflow.builtin.web",
              version: "1.0.0",
              packageDigest: "d".repeat(64),
              origin: "builtin",
              name: "Web",
              description: "Permissioned public web retrieval.",
              enabledPreference: true,
              status: "enabled",
              revision: 1,
              updatedAt: 1,
            },
          ],
          tools: [
            ...catalog.tools,
            {
              kind: "tool",
              id: "builtin.web.fetch",
              version: "1.0.0",
              definitionDigest: "e".repeat(64),
              definition: {
                name: "Fetch web page",
                description:
                  "Fetch a public HTTP or HTTPS resource and return sanitized readable text.",
                origin: "builtin",
                capabilities: ["network.connect"],
              },
              enabledPreference: true,
              status: "enabled",
              dependencyIssues: [],
              revision: 1,
              updatedAt: 1,
            },
            {
              kind: "tool",
              id: "builtin.web.search",
              version: "1.0.0",
              definitionDigest: "f".repeat(64),
              definition: {
                name: "Search web",
                description:
                  "Search the web through an explicitly configured provider and return normalized results.",
                origin: "builtin",
                capabilities: ["network.connect"],
              },
              enabledPreference: true,
              status: "enabled",
              dependencyIssues: [],
              revision: 1,
              updatedAt: 1,
            },
          ],
        }),
      }),
    );

    renderPage();

    expect(await screen.findByText("Web")).toBeVisible();
    expect(screen.getByText("Permissioned public web retrieval.")).toBeVisible();
    expect(screen.getByText("Fetch web page")).toBeVisible();
    expect(
      screen.getByText(
        "Fetch a public HTTP or HTTPS resource and return sanitized readable text.",
      ),
    ).toBeVisible();
    expect(screen.getByText("Search web")).toBeVisible();
    expect(
      screen.getByText(
        "Search the web through an explicitly configured provider and return normalized results.",
      ),
    ).toBeVisible();
    expect(screen.getAllByText("network.connect")).toHaveLength(2);
    expect(
      screen.getByRole("switch", { name: "停用Fetch web page" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("switch", { name: "停用Search web" }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("switches the Tool Catalog between primitive and model-facing facade views", async () => {
    const list = vi.fn(
      async ({
        modelFacingMode,
      }: {
        locale: "zh-CN" | "en" | "ja";
        modelFacingMode?: "direct" | "facade" | "directory";
      }) =>
        modelFacingMode === "facade"
          ? pagedFacadeCatalogFixture()
          : catalogFixture(),
    );
    setRealmflow(createToolCatalog({ list }));

    renderPage();

    expect(await screen.findByText("读取文件")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "模型可见" }));

    expect(await screen.findByText("Ask user")).toBeVisible();
    expect(screen.getByText("Secrets")).toBeVisible();
    expect(screen.getByText("Sessions")).toBeVisible();
    expect(screen.getByText("Subagents")).toBeVisible();
    expect(screen.getByText("Progress card")).toBeVisible();
    expect(screen.getByText("Capabilities")).toBeVisible();
    expect(await screen.findByText("Filesystem read")).toBeVisible();
    expect(screen.getAllByText("覆盖 0 个原子工具").length).toBeGreaterThanOrEqual(6);
    expect(screen.getByText("覆盖 5 个原子工具")).toBeVisible();
    expect(screen.getAllByText("最高风险：low").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Document")).toBeVisible();
    expect(screen.getByText("覆盖 14 个原子工具")).toBeVisible();
    expect(screen.getAllByText("最高风险：medium").length).toBeGreaterThanOrEqual(1);
    expect(list).toHaveBeenLastCalledWith({
      locale: "zh-CN",
      modelFacingMode: "facade",
    });

    fireEvent.click(screen.getByRole("button", { name: "原子工具" }));

    expect(await screen.findByText("读取文件")).toBeVisible();
    expect(list).toHaveBeenLastCalledWith({ locale: "zh-CN" });
  });

  it("shows directory catalog controls before directory-only primitive tools", async () => {
    const list = vi.fn(
      async ({
        modelFacingMode,
      }: {
        locale: "zh-CN" | "en" | "ja";
        modelFacingMode?: "direct" | "facade" | "directory";
      }) =>
        modelFacingMode === "directory"
          ? directoryCatalogFixture()
          : catalogFixture(),
    );
    setRealmflow(createToolCatalog({ list }));

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "目录检索" }));

    expect(await screen.findByText("Tool search")).toBeVisible();
    expect(screen.getByText("Tool describe")).toBeVisible();
    expect(screen.getByText("Tool call")).toBeVisible();
    expect(screen.getByText("Ask user")).toBeVisible();
    expect(screen.getByText("Progress card")).toBeVisible();
    expect(screen.getAllByText("覆盖 0 个原子工具").length).toBeGreaterThanOrEqual(6);
    expect(screen.getByText("Read file")).toBeVisible();
    expect(screen.getAllByText("目录检索").length).toBeGreaterThanOrEqual(2);
    expect(list).toHaveBeenLastCalledWith({
      locale: "zh-CN",
      modelFacingMode: "directory",
    });
  });

  it("opens one Add Capability menu for every creation path", async () => {
    setRealmflow(createToolCatalog());
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "添加能力" }));

    expect(screen.getByRole("menuitem", { name: "对话创建" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "导入能力包" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "手动配置" })).toBeVisible();
  });

  it("opens the Capability Builder in place from the conversation action", async () => {
    setRealmflow(createToolCatalog());
    window.realmflow = {
      ...window.realmflow!,
      capabilityBuilder: {
        createDraft: vi.fn(),
        getSession: vi.fn(),
        reviseDraft: vi.fn(),
        confirmInstall: vi.fn(),
        cancel: vi.fn(),
      },
    };
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "添加能力" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "对话创建" }));

    expect(screen.getByRole("dialog", { name: "对话创建能力" })).toBeVisible();
  });

  it("previews a validated capability and installs it disabled", async () => {
    const proposal = {
      proposalId: "proposal-1",
      definition: {
        schemaVersion: 1,
        id: "com.example.agent",
        kind: "agent",
        version: "1.0.0",
        source: "local_upload",
        manifestDigest: "a".repeat(64),
        definitionDigest: "b".repeat(64),
        name: "Review Agent",
        description: "Reviews changes.",
        runtime: {
          kind: "agent",
          promptPath: "README.md",
          modelCapabilities: [],
          reasoningModes: ["medium"],
          delegation: { allowed: false, maximumDepth: 0 },
        },
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
        testPlan: [{ id: "contract", command: "fixture:contract" }],
        publishedAt: 100,
      },
      packageDigest: "c".repeat(64),
      source: { type: "archive", displayName: "review-agent.zip" },
      byteSize: 100,
      fileCount: 2,
      validationReport: {
        compatible: true,
        dependencyStatus: "resolved",
        tests: [{ id: "contract", status: "passed" }],
      },
    } as const;
    const install = vi.fn().mockResolvedValue({
      definition: proposal.definition,
      installation: { status: "installed_disabled" },
    });
    const list = vi
      .fn()
      .mockResolvedValueOnce({
        definitions: [],
        installations: [],
      })
      .mockResolvedValue({
        definitions: [proposal.definition],
        installations: [
          {
            id: "installation-1",
            capabilityId: proposal.definition.id,
            capabilityVersion: proposal.definition.version,
            capabilityDigest: proposal.definition.definitionDigest,
            scope: { kind: "global" },
            enabled: false,
            permissionCeiling: proposal.definition.permissions,
            status: "installed_disabled",
            revision: 1,
            installedAt: 200,
            updatedAt: 200,
          },
        ],
      });
    window.realmflow = {
      business: {
        listConnectors: vi.fn().mockResolvedValue([]),
      } as unknown as BusinessApi,
      toolCatalog: createToolCatalog(),
      capabilityCatalog: {
        list,
        chooseAndPrepare: vi.fn().mockResolvedValue(proposal),
        install,
        discard: vi.fn(),
      },
    } as unknown as typeof window.realmflow;
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "添加能力" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "导入能力包" }));

    const importDialog = await screen.findByRole("dialog", {
      name: "确认安装能力",
    });
    expect(importDialog).toBeVisible();
    expect(importDialog).toHaveClass("ui-dialog", "ui-dialog--default");
    expect(importDialog.querySelector(".ui-dialog__body")).toBeInTheDocument();
    expect(screen.getByText("Review Agent")).toBeVisible();
    expect(
      within(screen.getByRole("dialog", { name: "确认安装能力" })).getByText(
        "用户全局",
      ),
    ).toBeVisible();
    expect(
      screen.getByText("安装后默认停用，需要明确启用后才会被新任务发现。"),
    ).toBeVisible();

    const installButton = screen.getByRole("button", { name: "安装" });
    expect(installButton).toHaveClass("ui-button", "ui-button--primary");
    fireEvent.click(installButton);
    await waitFor(() =>
      expect(install).toHaveBeenCalledWith({
        proposalId: "proposal-1",
        scope: { kind: "global" },
        enable: false,
      }),
    );
    expect(await screen.findByText("Review Agent")).toBeVisible();
    expect(
      within(screen.getByRole("region", { name: "已安装能力" })).getByText(
        "已关闭",
      ),
    ).toBeVisible();
  });

  it("waits for Main when enabling, upgrading, and rolling back a capability", async () => {
    const version1 = capabilityDefinitionFixture("1.0.0");
    const version2 = capabilityDefinitionFixture("2.0.0");
    const disabled = capabilityInstallationFixture(version1, {
      enabled: false,
      status: "installed_disabled",
    });
    let resolveEnabled!: (
      value: ReturnType<typeof capabilityInstallationFixture>,
    ) => void;
    const setEnabled = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveEnabled = resolve;
      }),
    );
    const changeVersion = vi
      .fn()
      .mockResolvedValueOnce(
        capabilityInstallationFixture(version2, { revision: 3 }),
      )
      .mockResolvedValueOnce(
        capabilityInstallationFixture(version1, { revision: 4 }),
      );
    window.realmflow = {
      business: {
        listConnectors: vi.fn().mockResolvedValue([]),
      } as unknown as BusinessApi,
      toolCatalog: createToolCatalog(),
      capabilityCatalog: {
        list: vi.fn().mockResolvedValue({
          definitions: [version1, version2],
          installations: [disabled],
        }),
        chooseAndPrepare: vi.fn(),
        install: vi.fn(),
        discard: vi.fn(),
        setEnabled,
        changeVersion,
      },
    } as unknown as typeof window.realmflow;
    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: "智能体" }));

    const activation = await screen.findByRole("switch", {
      name: "启用Review Agent",
    });
    fireEvent.click(activation);

    expect(activation).toHaveAttribute("aria-checked", "false");
    expect(activation).toBeDisabled();
    resolveEnabled(
      capabilityInstallationFixture(version1, {
        enabled: true,
        status: "enabled",
        revision: 2,
      }),
    );
    await waitFor(() =>
      expect(activation).toHaveAttribute("aria-checked", "true"),
    );

    const version = screen.getByRole("combobox", {
      name: "Review Agent 版本",
    });
    fireEvent.change(version, { target: { value: "2.0.0" } });
    fireEvent.click(screen.getByRole("button", { name: "升级 Review Agent" }));
    await waitFor(() =>
      expect(changeVersion).toHaveBeenCalledWith({
        installationId: "installation-agent",
        targetVersion: "2.0.0",
        expectedRevision: 2,
        operation: "upgrade",
      }),
    );

    fireEvent.change(version, { target: { value: "1.0.0" } });
    fireEvent.click(
      await screen.findByRole("button", { name: "回滚 Review Agent" }),
    );
    await waitFor(() =>
      expect(changeVersion).toHaveBeenLastCalledWith({
        installationId: "installation-agent",
        targetVersion: "1.0.0",
        expectedRevision: 3,
        operation: "rollback",
      }),
    );
  });

  it("shares search, source, scope, status, and risk filters across tabs", async () => {
    const definition = capabilityDefinitionFixture("1.0.0");
    const installation = capabilityInstallationFixture(definition);
    window.realmflow = {
      business: {
        listConnectors: vi.fn().mockResolvedValue([]),
      } as unknown as BusinessApi,
      toolCatalog: createToolCatalog(),
      capabilityCatalog: {
        list: vi.fn().mockResolvedValue({
          definitions: [definition],
          installations: [installation],
        }),
        chooseAndPrepare: vi.fn(),
        install: vi.fn(),
        discard: vi.fn(),
        setEnabled: vi.fn(),
        changeVersion: vi.fn(),
      },
    } as unknown as typeof window.realmflow;
    renderPage(
      "/capabilities?tab=agents&query=review&source=local_upload&scope=global&status=enabled&risk=low",
    );

    expect(await screen.findByRole("searchbox", { name: "搜索能力" })).toHaveValue(
      "review",
    );
    expect(screen.getByRole("combobox", { name: "来源" })).toHaveValue(
      "local_upload",
    );
    expect(screen.getByRole("combobox", { name: "安装作用域" })).toHaveValue(
      "global",
    );
    expect(screen.getByRole("combobox", { name: "启用状态" })).toHaveValue(
      "enabled",
    );
    expect(screen.getByRole("combobox", { name: "风险等级" })).toHaveValue(
      "low",
    );

    expect(await screen.findByText("Review Agent")).toBeVisible();
    fireEvent.change(screen.getByRole("searchbox", { name: "搜索能力" }), {
      target: { value: "missing" },
    });
    expect(screen.queryByText("Review Agent")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "搜索能力" }), {
      target: { value: "review" },
    });
    expect(screen.getByText("Review Agent")).toBeVisible();

    fireEvent.click(screen.getByRole("tab", { name: "工具" }));
    expect(screen.getByRole("searchbox", { name: "搜索能力" })).toHaveValue(
      "review",
    );
  });

  it("restores catalog origin and connector kind selections from the URL", async () => {
    setRealmflow(createToolCatalog());

    const tools = renderPage("/capabilities?origin=mcp");
    expect(screen.getByRole("button", { name: "MCP" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    tools.unmount();
    renderPage("/capabilities?tab=connectors&connectorKind=database");
    expect(screen.getByRole("button", { name: "Database" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("keeps a Toggle unchanged until Main confirms activation", async () => {
    let resolveActivation!: () => void;
    const activation = new Promise<void>((resolve) => {
      resolveActivation = resolve;
    });
    const toolCatalog = {
      list: vi.fn().mockResolvedValue(catalogFixture()),
      listMcpServers: vi.fn().mockResolvedValue([]),
      chooseAndImport: vi.fn(),
      setActivation: vi.fn().mockReturnValue(activation),
    } as unknown as ToolCatalogApi;
    window.realmflow = {
      business: {
        listConnectors: vi.fn().mockResolvedValue([]),
      } as unknown as BusinessApi,
      toolCatalog,
    } as typeof window.realmflow;

    renderPage();
    const toggle = await screen.findByRole("switch", {
      name: "停用读取文件",
    });
    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(toggle).toBeDisabled();
    resolveActivation();
    await waitFor(() => expect(toolCatalog.list).toHaveBeenCalledTimes(2));
  });

  it("filters installed Connector packages and shows kind, actions, scope, and review status", async () => {
    const database = connectorCapabilityFixture(
      "com.example.analytics",
      "Analytics DB",
      "database",
      2,
      "quarantined",
    );
    const cli = connectorCapabilityFixture(
      "com.example.release",
      "Release CLI",
      "cli",
      1,
      "enabled",
    );
    window.realmflow = {
      business: {
        listConnectors: vi.fn().mockResolvedValue([]),
      } as unknown as BusinessApi,
      toolCatalog: createToolCatalog({
        listMcpServers: vi.fn().mockResolvedValue([]),
      }),
      capabilityCatalog: {
        list: vi.fn().mockResolvedValue({
          definitions: [database.definition, cli.definition],
          installations: [database.installation, cli.installation],
        }),
        chooseAndPrepare: vi.fn(),
        install: vi.fn(),
        discard: vi.fn(),
        setEnabled: vi.fn(),
        changeVersion: vi.fn(),
        delete: vi.fn(),
      },
    } as unknown as typeof window.realmflow;

    renderPage();
    await openConnectorsTab();
    fireEvent.click(screen.getByRole("button", { name: "Database" }));

    expect(await screen.findByText("Analytics DB")).toBeVisible();
    expect(screen.getByText("Database · 2 个动作 · 待复核")).toBeVisible();
    expect(screen.getByText("Global")).toBeVisible();
    expect(screen.queryByText("Release CLI")).not.toBeInTheDocument();
    expect(screen.queryByText("暂无 Database 连接器")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "CLI" }));
    expect(await screen.findByText("Release CLI")).toBeVisible();
    expect(screen.getByText("CLI · 1 个动作 · 可用")).toBeVisible();
    expect(screen.queryByText("Analytics DB")).not.toBeInTheDocument();
  });

  it("waits for Main before adding an MCP Server to the visible list", async () => {
    let confirmSave!: (value: ReturnType<typeof mcpServerFixture>) => void;
    const pendingSave = new Promise<ReturnType<typeof mcpServerFixture>>(
      (resolve) => {
        confirmSave = resolve;
      },
    );
    const toolCatalog = {
      list: vi.fn().mockResolvedValue(catalogFixture()),
      listMcpServers: vi.fn().mockResolvedValue([]),
      chooseAndImport: vi.fn(),
      setActivation: vi.fn(),
      saveMcpServer: vi.fn().mockReturnValue(pendingSave),
      deleteMcpServer: vi.fn(),
      testMcpServer: vi.fn(),
      discoverMcpServer: vi.fn(),
    } as unknown as ToolCatalogApi;
    window.realmflow = {
      business: {
        listConnectors: vi.fn().mockResolvedValue([]),
      } as unknown as BusinessApi,
      toolCatalog,
    } as typeof window.realmflow;

    renderPage();
    await openConnectorsTab();
    fireEvent.click(
      await screen.findByRole("button", { name: "添加 MCP 服务器" }),
    );
    fireEvent.change(screen.getByLabelText("服务器 ID"), {
      target: { value: "search" },
    });
    fireEvent.change(screen.getByLabelText("名称"), {
      target: { value: "Remote Search" },
    });
    fireEvent.change(screen.getByLabelText("服务地址"), {
      target: { value: "https://mcp.example.com/rpc" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存服务器" }));

    expect(
      screen.getByRole("dialog", { name: "添加 MCP 服务器" }),
    ).toBeVisible();
    expect(screen.queryByText("已连接")).not.toBeInTheDocument();
    confirmSave(mcpServerFixture());

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "添加 MCP 服务器" }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Remote Search")).toBeVisible();
  });

  it("keeps a stable load failure inline without exposing the exception", async () => {
    window.realmflow = {
      business: {
        listConnectors: vi
          .fn()
          .mockRejectedValue(
            new Error("/Users/private/.credentials could not be read"),
          ),
      } as unknown as BusinessApi,
      toolCatalog: createToolCatalog(),
    } as typeof window.realmflow;

    renderPage();

    expect(await screen.findByText("无法加载能力")).toHaveClass(
      "model-page-error",
    );
    expect(
      screen.queryByText("/Users/private/.credentials could not be read"),
    ).not.toBeInTheDocument();
  });

  it("publishes activation failures as a Toast without exposing the exception", async () => {
    const toolCatalog = createToolCatalog({
      setActivation: vi
        .fn()
        .mockRejectedValue(new Error("/Users/private/catalog.db is locked")),
    });
    setRealmflow(toolCatalog);
    renderPage();

    fireEvent.click(
      await screen.findByRole("switch", { name: "停用读取文件" }),
    );

    expect(await screen.findByText("无法更新启用状态")).toBeVisible();
    expect(document.querySelector(".model-page-error")).toBeNull();
    expect(
      screen.queryByText("/Users/private/catalog.db is locked"),
    ).not.toBeInTheDocument();
  });

  it("publishes import failures as a Toast without exposing the exception", async () => {
    const toolCatalog = createToolCatalog({
      chooseAndImport: vi
        .fn()
        .mockRejectedValue(new Error("archive contained SECRET_TOKEN")),
    });
    setRealmflow(toolCatalog);
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "导入压缩包" }));

    expect(await screen.findByText("无法导入扩展包")).toBeVisible();
    expect(document.querySelector(".model-page-error")).toBeNull();
    expect(
      screen.queryByText("archive contained SECRET_TOKEN"),
    ).not.toBeInTheDocument();
  });

  it("uses the shared dialog, field, and button structure for the MCP editor", async () => {
    setRealmflow(
      createToolCatalog({
        listMcpServers: vi.fn().mockResolvedValue([]),
      }),
    );
    renderPage();
    await openConnectorsTab();

    fireEvent.click(
      await screen.findByRole("button", { name: "添加 MCP 服务器" }),
    );

    const dialog = screen.getByRole("dialog", { name: "添加 MCP 服务器" });
    const scrollBody = dialog.querySelector('[data-dialog-scroll="true"]');

    expect(dialog).toHaveClass("ui-dialog");
    expect(scrollBody).toHaveClass("ui-dialog__body");
    expect(dialog.querySelectorAll(".ui-field").length).toBeGreaterThan(0);
    expect(dialog.querySelectorAll(".ui-button").length).toBeGreaterThan(1);
    expect(dialog.querySelectorAll('[data-dialog-scroll="true"]')).toHaveLength(
      1,
    );
  });

  it("publishes MCP save failures as a Toast and keeps the editor open", async () => {
    const toolCatalog = createToolCatalog({
      listMcpServers: vi.fn().mockResolvedValue([]),
      saveMcpServer: vi
        .fn()
        .mockRejectedValue(
          new Error("https://user:password@mcp.example.com failed"),
        ),
    });
    setRealmflow(toolCatalog);
    renderPage();
    await openConnectorsTab();

    fireEvent.click(
      await screen.findByRole("button", { name: "添加 MCP 服务器" }),
    );
    fireEvent.change(screen.getByLabelText("服务器 ID"), {
      target: { value: "search" },
    });
    fireEvent.change(screen.getByLabelText("名称"), {
      target: { value: "Remote Search" },
    });
    fireEvent.change(screen.getByLabelText("服务地址"), {
      target: { value: "https://mcp.example.com/rpc" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存服务器" }));

    expect(await screen.findByText("无法保存 MCP 服务器")).toBeVisible();
    expect(
      screen.getByRole("dialog", { name: "添加 MCP 服务器" }),
    ).toBeVisible();
    expect(document.querySelector(".model-page-error")).toBeNull();
    expect(
      screen.queryByText("https://user:password@mcp.example.com failed"),
    ).not.toBeInTheDocument();
  });

  it.each([
    {
      name: "update",
      button: { role: "switch" as const, name: "停用Remote Search" },
      apiMethod: "saveMcpServer" as const,
      expected: "无法更新 MCP 服务器",
    },
    {
      name: "test",
      button: { role: "button" as const, name: "测试Remote Search" },
      apiMethod: "testMcpServer" as const,
      expected: "无法测试 MCP 服务器",
    },
    {
      name: "discover",
      button: { role: "button" as const, name: "发现Remote Search的工具" },
      apiMethod: "discoverMcpServer" as const,
      expected: "无法发现 MCP 工具",
    },
  ])(
    "publishes MCP $name failures as a Toast",
    async ({ button, apiMethod, expected }) => {
      const toolCatalog = createToolCatalog({
        [apiMethod]: vi
          .fn()
          .mockRejectedValue(
            new Error("/Users/private/mcp.log contains TOKEN"),
          ),
      });
      setRealmflow(toolCatalog);
      renderPage();
      await openConnectorsTab();

      fireEvent.click(
        await screen.findByRole(button.role, { name: button.name }),
      );

      expect(await screen.findByText(expected)).toBeVisible();
      expect(document.querySelector(".model-page-error")).toBeNull();
      expect(
        screen.queryByText("/Users/private/mcp.log contains TOKEN"),
      ).not.toBeInTheDocument();
    },
  );

  it("publishes MCP delete failures as a Toast and keeps confirmation open", async () => {
    const toolCatalog = createToolCatalog({
      deleteMcpServer: vi
        .fn()
        .mockRejectedValue(
          new Error("/Users/private/mcp.json could not be deleted"),
        ),
    });
    setRealmflow(toolCatalog);
    renderPage();
    await openConnectorsTab();

    fireEvent.click(
      await screen.findByRole("button", { name: "删除Remote Search" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "删除服务器" }));

    expect(await screen.findByText("无法删除 MCP 服务器")).toBeVisible();
    expect(
      screen.getByRole("dialog", { name: "删除 MCP 服务器" }),
    ).toBeVisible();
    expect(document.querySelector(".model-page-error")).toBeNull();
    expect(
      screen.queryByText("/Users/private/mcp.json could not be deleted"),
    ).not.toBeInTheDocument();
  });
});

function capabilityDefinitionFixture(version: string) {
  return {
    schemaVersion: 1,
    id: "com.example.agent",
    kind: "agent",
    version,
    source: "local_upload",
    manifestDigest: version === "1.0.0" ? "a".repeat(64) : "b".repeat(64),
    definitionDigest: version === "1.0.0" ? "c".repeat(64) : "d".repeat(64),
    name: "Review Agent",
    description: "Reviews changes.",
    runtime: {
      kind: "agent",
      promptPath: "README.md",
      modelCapabilities: [],
      reasoningModes: ["medium"],
      delegation: { allowed: false, maximumDepth: 0 },
    },
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
    publishedAt: 100,
  } as const;
}

function capabilityInstallationFixture(
  definition: ReturnType<typeof capabilityDefinitionFixture>,
  input: Partial<{
    enabled: boolean;
    status: "enabled" | "installed_disabled";
    revision: number;
  }> = {},
) {
  return {
    id: "installation-agent",
    capabilityId: definition.id,
    capabilityVersion: definition.version,
    capabilityDigest: definition.definitionDigest,
    scope: { kind: "global" } as const,
    enabled: true,
    permissionCeiling: definition.permissions,
    status: "enabled" as const,
    revision: 1,
    installedAt: 100,
    updatedAt: 100,
    ...input,
  };
}

function connectorCapabilityFixture(
  id: string,
  name: string,
  connectorKind: "database" | "cli",
  actionCount: number,
  status: "enabled" | "quarantined",
) {
  const actions = Array.from({ length: actionCount }, (_, index) => ({
    id: `action-${index + 1}`,
    name: `Action ${index + 1}`,
    description: "Fixture action.",
    operation: "read" as const,
    inputSchema: { type: "object" },
    outputSchema: { type: "object" },
    risk: "low" as const,
    effects: ["external.read"],
    timeoutMs: 5_000,
    maxOutputBytes: 16_384,
    protocol:
      connectorKind === "database"
        ? {
            kind: "database" as const,
            driver: "sqlite" as const,
            access: "read" as const,
            statement: "SELECT id FROM documents",
            parameterNames: [],
            allowedTables: ["documents"],
            maxRows: 100,
          }
        : {
            kind: "cli" as const,
            executable: "/usr/bin/git",
            subcommand: ["status"],
            argumentNames: [],
            workingDirectory: "workspace" as const,
            environmentCredentialRefs: {},
          },
  }));
  const definition = {
    schemaVersion: 1 as const,
    id,
    kind: "connector" as const,
    version: "1.0.0",
    source: "local_upload" as const,
    manifestDigest: "7".repeat(64),
    definitionDigest: id.includes("analytics")
      ? "8".repeat(64)
      : "9".repeat(64),
    name,
    description: "Connector package.",
    runtime: {
      kind: "connector" as const,
      connectorKind,
      credentialRefs: [],
      configurationSchema: { type: "object" },
      actions,
    },
    permissions: {
      capabilities: ["connector.use" as const],
      maximumRisk: "low" as const,
      pathPrefixes: [],
      networkTargets: [],
    },
    dependencies: [],
    compatibility: {
      realmflowVersionRange: ">=0.1.0",
      platforms: ["darwin" as const],
    },
    testPlan: [],
    publishedAt: 100,
  };
  return {
    definition,
    installation: {
      id: `installation.${id}`,
      capabilityId: id,
      capabilityVersion: "1.0.0",
      capabilityDigest: definition.definitionDigest,
      scope: { kind: "global" as const },
      enabled: status === "enabled",
      permissionCeiling: definition.permissions,
      status,
      revision: 1,
      installedAt: 100,
      updatedAt: 100,
    },
  };
}

function renderPage(
  initialEntry = "/capabilities",
): ReturnType<typeof testingRender> {
  return testingRender(
    <MemoryRouter initialEntries={[initialEntry]}>
      <LocalizationProvider>
        <ToastProvider>
          <CapabilitiesPage />
        </ToastProvider>
      </LocalizationProvider>
    </MemoryRouter>,
  );
}

function LocaleSwitchingCapabilities(): JSX.Element {
  const { setLocale } = useLocalization();
  return (
    <ToastProvider>
      <button type="button" onClick={() => setLocale("en")}>
        switch locale
      </button>
      <CapabilitiesPage />
    </ToastProvider>
  );
}

async function openConnectorsTab(): Promise<void> {
  fireEvent.click(screen.getByRole("tab", { name: "连接器" }));
  await screen.findByRole("button", { name: "MCP" });
}

function setRealmflow(toolCatalog: ToolCatalogApi): void {
  window.realmflow = {
    business: {
      listConnectors: vi.fn().mockResolvedValue([]),
    } as unknown as BusinessApi,
    toolCatalog,
  } as typeof window.realmflow;
}

function createToolCatalog(
  overrides: Partial<ToolCatalogApi> = {},
): ToolCatalogApi {
  return {
    list: vi.fn().mockResolvedValue(catalogFixture()),
    listMcpServers: vi.fn().mockResolvedValue([mcpServerFixture()]),
    chooseAndImport: vi.fn(),
    setActivation: vi.fn(),
    saveMcpServer: vi.fn(),
    deleteMcpServer: vi.fn(),
    testMcpServer: vi.fn(),
    discoverMcpServer: vi.fn(),
    ...overrides,
  } as unknown as ToolCatalogApi;
}

function catalogFixture(): ToolCatalogDto {
  return {
    packages: [
      {
        packageId: "realmflow.builtin.files",
        version: "1.0.0",
        packageDigest: "a".repeat(64),
        origin: "builtin",
        name: "文件",
        description: "本地文件能力",
        enabledPreference: true,
        status: "enabled",
        revision: 1,
        updatedAt: 1,
      },
    ],
    tools: [
      {
        kind: "tool",
        id: "builtin.files.read",
        version: "1.0.0",
        definitionDigest: "b".repeat(64),
        definition: {
          name: "读取文件",
          description: "读取授权文件",
          origin: "builtin",
          capabilities: ["filesystem.read"],
        },
        enabledPreference: true,
        status: "enabled",
        dependencyIssues: [],
        revision: 1,
        updatedAt: 1,
      },
    ],
    skills: [
      {
        kind: "skill",
        id: "builtin.skill.requirement_analysis",
        version: "1.0.0",
        definitionDigest: "c".repeat(64),
        definition: {
          name: "需求分析",
          description: "澄清需求边界",
          origin: "builtin",
        },
        enabledPreference: true,
        status: "enabled",
        dependencyIssues: [],
        revision: 1,
        updatedAt: 1,
      },
    ],
  } as unknown as ToolCatalogDto;
}

function facadeCatalogFixture(): ToolCatalogDto {
  const catalog = catalogFixture();
  return {
    ...catalog,
    tools: [
      ...runtimeToolFixtures("facade"),
      {
        kind: "tool",
        id: "filesystem_read",
        version: "1.0.0",
        definitionDigest: "d".repeat(64),
        definition: {
          name: "Filesystem read",
          description: "List, inspect, search, and read local files.",
          origin: "builtin",
          capabilities: ["filesystem.read"],
        },
        enabledPreference: true,
        status: "enabled",
        dependencyIssues: [],
        revision: 1,
        updatedAt: 1,
        modelFacing: {
          mode: "facade",
          kind: "facade",
          visibility: "direct",
          coveredPrimitiveToolIds: [
            "builtin.documents.read",
            "builtin.files.list",
            "builtin.files.read",
            "builtin.files.search",
            "builtin.files.stat",
          ],
          maxRisk: "low",
        },
      },
      {
        kind: "tool",
        id: "document",
        version: "1.0.0",
        definitionDigest: "e".repeat(64),
        definition: {
          name: "Document",
          description:
            "Create, inspect, edit, comment, save, export, and verify documents.",
          origin: "builtin",
          capabilities: ["filesystem.read", "filesystem.write"],
        },
        enabledPreference: true,
        status: "enabled",
        dependencyIssues: [],
        revision: 1,
        updatedAt: 1,
        modelFacing: {
          mode: "facade",
          kind: "facade",
          visibility: "direct",
          coveredPrimitiveToolIds: [
            "builtin.artifact.verify",
            "builtin.document.comment_add",
            "builtin.document.comment_delete",
            "builtin.document.create",
            "builtin.document.export_pdf",
            "builtin.document.find",
            "builtin.document.insert_blocks",
            "builtin.document.inspect",
            "builtin.document.replace_text",
            "builtin.document.save",
            "builtin.document.table_insert",
            "builtin.document.table_write",
            "builtin.document.update_layout",
            "builtin.document.update_style",
          ],
          maxRisk: "medium",
        },
      },
      {
        ...catalog.tools[0],
        modelFacing: {
          mode: "facade",
          kind: "primitive",
          visibility: "facade_backed",
          facadeId: "filesystem_read",
        },
      },
    ],
  } as unknown as ToolCatalogDto;
}

function runtimeToolFixtures(mode: "facade" | "directory") {
  return [
    ["ask_user", "Ask user", "low"],
    ["secrets", "Secrets", "medium"],
    ["sessions", "Sessions", "medium"],
    ["subagents", "Subagents", "medium"],
    ["progress_card", "Progress card", "low"],
    ["capabilities", "Capabilities", "high"],
  ].map(([id, name, risk], index) => ({
    kind: "tool",
    id,
    version: "1.0.0",
    definitionDigest: String(index + 1).repeat(64),
    definition: {
      name,
      description: `${name} runtime control.`,
      origin: "builtin",
      capabilities: [],
    },
    enabledPreference: true,
    status: "enabled",
    dependencyIssues: [],
    revision: 0,
    updatedAt: 0,
    modelFacing: {
      mode,
      kind: "facade",
      visibility: "direct",
      coveredPrimitiveToolIds: [],
      maxRisk: risk,
    },
  }));
}

function pagedFacadeCatalogFixture(): ToolCatalogDto {
  const catalog = facadeCatalogFixture();
  const primitiveTool = catalog.tools.find(
    (tool) => tool.id === "builtin.files.read",
  );
  if (!primitiveTool) throw new Error("Missing primitive fixture");
  return {
    ...catalog,
    tools: [
      ...catalog.tools,
      ...Array.from({ length: 105 }, (_, index) => ({
        ...primitiveTool,
        id: `builtin.files.synthetic_${index}`,
        definition: {
          ...primitiveTool.definition,
          name: `测试工具 ${String(index).padStart(3, "0")}`,
        },
      })),
    ],
  } as unknown as ToolCatalogDto;
}

function directoryCatalogFixture(): ToolCatalogDto {
  const catalog = catalogFixture();
  return {
    ...catalog,
    tools: [
      {
        kind: "tool",
        id: "tool_search",
        version: "1.0.0",
        definitionDigest: "d".repeat(64),
        definition: {
          name: "Tool search",
          description: "Search the hidden tool directory after policy filtering.",
          origin: "builtin",
          capabilities: [],
        },
        enabledPreference: true,
        status: "enabled",
        dependencyIssues: [],
        revision: 0,
        updatedAt: 0,
        modelFacing: {
          mode: "directory",
          kind: "facade",
          visibility: "direct",
          coveredPrimitiveToolIds: [],
          maxRisk: "low",
        },
      },
      {
        kind: "tool",
        id: "tool_describe",
        version: "1.0.0",
        definitionDigest: "e".repeat(64),
        definition: {
          name: "Tool describe",
          description: "Read the full schema and risk metadata for a hidden tool.",
          origin: "builtin",
          capabilities: [],
        },
        enabledPreference: true,
        status: "enabled",
        dependencyIssues: [],
        revision: 0,
        updatedAt: 0,
        modelFacing: {
          mode: "directory",
          kind: "facade",
          visibility: "direct",
          coveredPrimitiveToolIds: [],
          maxRisk: "low",
        },
      },
      {
        kind: "tool",
        id: "tool_call",
        version: "1.0.0",
        definitionDigest: "f".repeat(64),
        definition: {
          name: "Tool call",
          description: "Invoke a hidden tool through primitive permission and audit paths.",
          origin: "builtin",
          capabilities: [],
        },
        enabledPreference: true,
        status: "enabled",
        dependencyIssues: [],
        revision: 0,
        updatedAt: 0,
        modelFacing: {
          mode: "directory",
          kind: "facade",
          visibility: "direct",
          coveredPrimitiveToolIds: [],
          maxRisk: "low",
        },
      },
      ...runtimeToolFixtures("directory"),
      {
        ...catalog.tools[0],
        definition: {
          ...catalog.tools[0].definition,
          name: "Read file",
          description: "Read an authorized local file.",
        },
        modelFacing: {
          mode: "directory",
          kind: "primitive",
          visibility: "directory_only",
        },
      },
    ],
  } as unknown as ToolCatalogDto;
}

function mcpServerFixture() {
  return {
    id: "search",
    name: "Remote Search",
    identity: "a".repeat(64),
    enabled: true,
    transport: {
      kind: "streamable_http" as const,
      url: "https://mcp.example.com/rpc",
      credentialNames: [],
    },
    revision: 1,
    hasCredentials: {},
  };
}

function connectorFixture() {
  return {
    connector: {
      id: "connector-docs",
      name: "Docs",
      type: "http" as const,
      baseUrl: "https://docs.example.com/api",
      authentication: { type: "bearer" as const },
      enabled: true,
      timeoutMs: 5000,
      maxRetries: 1,
      revision: 1,
      createdAt: 10,
      updatedAt: 10,
    },
    hasCredential: true,
  };
}
