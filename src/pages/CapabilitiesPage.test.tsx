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

  it("uses the shared wide page, product search, and empty state primitives", async () => {
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
    expect(screen.getByRole("searchbox", { name: "搜索工具" })).toBeVisible();
    await screen.findByText("文件系统");
    expect(container.querySelector(".product-capability-grid")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "智能体" }));
    expect(await screen.findByText("通用协作智能体")).toBeVisible();
    expect(
      container.querySelector(".agent-profile-directory"),
    ).toBeInTheDocument();
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

    expect(await screen.findByText("文件系统")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "switch locale" }));
    expect(await screen.findByText("Filesystem")).toBeVisible();
    expect(list).toHaveBeenLastCalledWith({
      locale: "en",
      modelFacingMode: "facade",
    });
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
    await screen.findByText("文件系统");
    expect(screen.queryByText("Remote Search")).not.toBeInTheDocument();
    expect(screen.queryByText("Docs")).not.toBeInTheDocument();
    expect(screen.getByText("文件系统")).toBeVisible();
    expect(screen.queryByText("需求分析")).not.toBeInTheDocument();

    fireEvent.click(skillsTab);

    expect(toolsTab).toHaveAttribute("aria-selected", "false");
    expect(skillsTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("需求分析")).toBeVisible();
    expect(screen.queryByText("文件系统")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "HTTP 连接器" }),
    ).not.toBeInTheDocument();

    fireEvent.click(agentsTab);

    expect(toolsTab).toHaveAttribute("aria-selected", "false");
    expect(skillsTab).toHaveAttribute("aria-selected", "false");
    expect(agentsTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("通用协作智能体")).toBeVisible();
    expect(screen.queryByText("需求分析")).not.toBeInTheDocument();
    expect(screen.queryByText("文件系统")).not.toBeInTheDocument();

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

  it("shows one aggregated Tool per product capability without technical catalog sections", async () => {
    const list = vi.fn(
      async ({
        modelFacingMode,
      }: {
        locale: "zh-CN" | "en" | "ja";
        modelFacingMode?: "direct" | "facade" | "directory";
      }) =>
        modelFacingMode === "facade"
          ? facadeCatalogFixture()
          : catalogFixture(),
    );
    const duplicate = legacyCapabilityFixture({
      id: "legacy.tool.filesystem_read",
      kind: "tool",
      name: "Filesystem read",
      runtime: { kind: "tool", definitionId: "filesystem_read" },
    });
    window.realmflow = {
      business: {
        listConnectors: vi.fn().mockResolvedValue([]),
      } as unknown as BusinessApi,
      toolCatalog: createToolCatalog({ list }),
      capabilityCatalog: {
        list: vi.fn().mockResolvedValue({
          definitions: [duplicate.definition],
          installations: [duplicate.installation],
          displayByDefinitionKey: {},
        }),
      },
    } as unknown as typeof window.realmflow;

    renderPage();

    expect(await screen.findByText("文件系统")).toBeVisible();
    expect(screen.getAllByText("文件系统")).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: "扩展包" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "工具目录" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "全部工具" })).toBeNull();
    expect(screen.queryByText("17")).toBeNull();
    expect(list).toHaveBeenLastCalledWith({
      locale: "zh-CN",
      modelFacingMode: "facade",
    });
    const controls = screen
      .getByRole("group", { name: "按产品能力分组" })
      .closest(".product-capability-directory-controls");
    expect(controls).toContainElement(
      screen.getByRole("searchbox", { name: "搜索工具" }),
    );
    expect(controls?.firstElementChild).toHaveClass(
      "product-capability-groups",
    );
    const searchControl = screen
      .getByRole("searchbox", { name: "搜索工具" })
      .closest(".product-capability-directory-search");
    expect(searchControl).toHaveAttribute("data-expanded", "false");
    expect(screen.getByRole("searchbox", { name: "搜索工具" })).toHaveAttribute(
      "tabindex",
      "-1",
    );
    expect(
      screen.getByRole("button", { name: "搜索" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "全部" })).toHaveClass(
      "product-capability-group-all",
    );

    fireEvent.click(screen.getByRole("button", { name: "搜索" }));

    expect(searchControl).toHaveAttribute("data-expanded", "true");
    expect(screen.getByRole("searchbox", { name: "搜索工具" })).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "文件与知识" }));

    expect(screen.getByText("文件系统")).toBeVisible();
    expect(screen.queryByText("Document")).toBeNull();
  });

  it("shows one Skill per capability without registry or package sections", async () => {
    const duplicate = legacyCapabilityFixture({
      id: "legacy.skill.builtin.skill.requirement_analysis",
      kind: "skill",
      name: "需求分析",
      runtime: {
        kind: "skill",
        instructionsPath: "skills/requirement-analysis/SKILL.md",
        executable: false,
      },
    });
    window.realmflow = {
      business: {
        listConnectors: vi.fn().mockResolvedValue([]),
      } as unknown as BusinessApi,
      toolCatalog: createToolCatalog(),
      capabilityCatalog: {
        list: vi.fn().mockResolvedValue({
          definitions: [duplicate.definition],
          installations: [duplicate.installation],
          displayByDefinitionKey: {},
        }),
      },
    } as unknown as typeof window.realmflow;

    renderPage("/capabilities?tab=skills");

    expect(await screen.findByText("需求分析")).toBeVisible();
    expect(screen.getAllByText("需求分析")).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: "技能注册表" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "扩展包" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "技能目录" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "全部技能" })).toBeNull();
  });

  it("shows Skill dependency issues in the product Skill detail", async () => {
    const catalog = catalogFixture();
    setRealmflow(
      createToolCatalog({
        list: vi.fn().mockResolvedValue({
          ...catalog,
          skills: [
            {
              ...catalog.skills[0],
              id: "workspace.skill.review",
              status: "dependency_disabled",
              dependencyIssues: ["builtin.files.read@^2.0.0"],
              definition: {
                ...catalog.skills[0].definition,
                name: "Review workflow",
                description: "Reviews repository changes.",
              },
            },
          ],
        }),
      }),
    );

    renderPage("/capabilities?tab=skills");

    fireEvent.click(await screen.findByRole("button", { name: "Review workflow" }));

    const dialog = screen.getByRole("dialog", { name: "Review workflow" });
    expect(within(dialog).getByText("依赖不可用")).toBeVisible();
    expect(within(dialog).getByText("builtin.files.read@^2.0.0")).toBeVisible();
  });

  it("shows agent portraits with scene filters and expandable search", async () => {
    setRealmflow(createToolCatalog());

    renderPage("/capabilities?tab=agents");

    expect(await screen.findByText("通用协作智能体")).toBeVisible();
    expect(
      screen.queryByRole("searchbox", { name: "搜索能力" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "来源" }),
    ).not.toBeInTheDocument();
    const scenes = screen.getByRole("group", {
      name: "按运行场景筛选智能体",
    });
    expect(
      within(scenes).getByRole("button", { name: "全部" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      within(scenes).getByRole("button", { name: "需求节点" }),
    ).toBeVisible();

    const search = screen.getByRole("searchbox", { name: "搜索智能体" });
    const searchControl = search.closest(".agent-profile-directory-search");
    expect(searchControl).toHaveAttribute("data-expanded", "false");
    expect(search).toHaveAttribute("tabindex", "-1");

    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    expect(searchControl).toHaveAttribute("data-expanded", "true");
    expect(search).toHaveFocus();
    fireEvent.change(search, { target: { value: "需求" } });

    expect(screen.getByText("需求执行智能体")).toBeVisible();
    expect(screen.queryByText("空间协作智能体")).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "" } });
    fireEvent.click(within(scenes).getByRole("button", { name: "定时任务" }));
    expect(screen.getByText("工作流执行智能体")).toBeVisible();
    expect(screen.queryByText("需求执行智能体")).not.toBeInTheDocument();
  });

  it("keeps the Agents tab focused on the portrait directory only", async () => {
    const definition = capabilityDefinitionFixture("1.0.0");
    window.realmflow = {
      business: {
        listConnectors: vi.fn().mockResolvedValue([]),
      } as unknown as BusinessApi,
      toolCatalog: createToolCatalog(),
      capabilityCatalog: {
        list: vi.fn().mockResolvedValue({
          definitions: [definition],
          installations: [
            capabilityInstallationFixture(definition, {
              enabled: false,
              status: "installed_disabled",
            }),
          ],
          displayByDefinitionKey: {},
        }),
        chooseAndPrepare: vi.fn(),
        install: vi.fn(),
        discard: vi.fn(),
        setEnabled: vi.fn(),
        changeVersion: vi.fn(),
      },
    } as unknown as typeof window.realmflow;

    renderPage("/capabilities?tab=agents");

    expect(await screen.findByText("通用协作智能体")).toBeVisible();
    expect(await screen.findAllByText("Review Agent")).not.toHaveLength(0);
    expect(
      screen.queryByRole("region", { name: "已安装能力" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("switch", { name: "启用Review Agent" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "工具权限" })).toBeNull();
  });

  it("opens an agent portrait detail with persona, prompt, tools, and skills", async () => {
    setRealmflow(createToolCatalog());

    renderPage("/capabilities?tab=agents");

    fireEvent.click(
      await screen.findByRole("button", { name: /通用协作智能体/ }),
    );

    const dialog = screen.getByRole("dialog", { name: "通用协作智能体" });
    expect(screen.getByTestId("ui-dialog-backdrop")).not.toHaveClass(
      "ui-dialog-backdrop--workspace",
    );
    expect(within(dialog).getByRole("heading", { name: "人设" })).toBeVisible();
    expect(within(dialog).getAllByText(/本地优先/).length).toBeGreaterThan(0);
    expect(
      within(dialog).getByRole("heading", { name: "系统提示词" }),
    ).toBeVisible();
    expect(
      within(dialog).getByText(/Keep business data local/),
    ).toBeVisible();
    expect(
      within(dialog).getByRole("heading", { name: "使用工具" }),
    ).toBeVisible();
    expect(within(dialog).getByText("文件系统")).toBeVisible();
    expect(within(dialog).getByText("网页访问")).toBeVisible();
    expect(
      within(dialog).getByRole("heading", { name: "使用技能" }),
    ).toBeVisible();
    expect(within(dialog).getByText("需求分析")).toBeVisible();
  });

  it("aggregates builtin web primitives into one Web product Tool", async () => {
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

    expect(await screen.findByText("网页访问")).toBeVisible();
    expect(
      screen.getByText("搜索公开网页并提取经过清理的可读内容。"),
    ).toBeVisible();
    const row = screen
      .getByRole("button", { name: /网页访问/ })
      .closest(".product-capability-row");
    expect(row).toHaveClass("product-capability-row--interactive");
    expect(row?.querySelector(".product-capability-icon")).toBeInTheDocument();
    expect(within(row as HTMLElement).queryByText(/覆盖/)).toBeNull();
    expect(within(row as HTMLElement).queryByText("可用")).toBeNull();
    expect(screen.queryByText("Fetch web page")).toBeNull();
    expect(screen.queryByText("Search web")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /网页访问/ }));

    const dialog = screen.getByRole("dialog", { name: "网页访问" });
    expect(within(dialog).getByText("覆盖 2 个原子工具")).toBeVisible();
    expect(within(dialog).getByText("可用")).toBeVisible();
    expect(within(dialog).queryByText("关闭")).toBeNull();
  });

  it("shows Plugin contributions, permission review, sandbox, and dependency state before enablement", async () => {
    const catalog = catalogFixture();
    const setActivation = vi.fn().mockResolvedValue(undefined);
    setRealmflow(
      createToolCatalog({
        list: vi.fn().mockResolvedValue({
          ...catalog,
          packages: [
            {
              packageId: "com.example.research",
              version: "1.0.0",
              packageDigest: "d".repeat(64),
              origin: "local_upload",
              name: "Research",
              description: "Research Plugin.",
              enabledPreference: false,
              status: "dependency_disabled",
              dependencyIssues: ["com.example.foundation"],
              revision: 1,
              updatedAt: 100,
              plugin: {
                permissions: {
                  capabilities: ["filesystem.read", "network.connect"],
                  maximumRisk: "medium",
                  pathPrefixes: ["/workspace"],
                  networkTargets: ["https://api.example.com"],
                },
                sandboxes: [
                  {
                    id: "worker",
                    runtime: "node",
                    filesystem: "package-read",
                    networkTargets: ["https://api.example.com"],
                    maximumDurationMs: 30_000,
                    maximumMemoryMb: 128,
                  },
                ],
                dependencies: [
                  {
                    packageId: "com.example.foundation",
                    versionRange: "^1.0.0",
                    required: true,
                    toolIds: [],
                  },
                ],
                contributions: [
                  {
                    kind: "tool",
                    id: "research.search",
                    definitionDigest: "e".repeat(64),
                  },
                  {
                    kind: "skill",
                    id: "research.workflow",
                    definitionDigest: "f".repeat(64),
                  },
                  {
                    kind: "connector",
                    id: "research.connector",
                    definitionDigest: "1".repeat(64),
                  },
                  {
                    kind: "web_provider",
                    id: "research.web",
                    definitionDigest: "2".repeat(64),
                  },
                  {
                    kind: "hook",
                    id: "research.after-search",
                    definitionDigest: "3".repeat(64),
                    targetToolId: "research.search",
                    event: "tool.completed",
                  },
                ],
              },
            },
          ],
          tools: [],
          skills: [],
        }),
        setActivation,
      }),
    );

    renderPage();
    await openCatalogManagement();

    expect(await screen.findByText("Research")).toBeVisible();
    expect(
      screen.getByText(
        "工具 1 · 技能 1 · 连接器 1 · 提供方 1 · Hook 1",
      ),
    ).toBeVisible();
    expect(screen.getByText("2 项权限 · medium 风险")).toBeVisible();
    expect(screen.getByText("1 个沙箱")).toBeVisible();
    expect(screen.getByText("1 项必需依赖")).toBeVisible();
    expect(screen.getByText("com.example.foundation")).toBeVisible();

    fireEvent.click(
      screen.getByRole("switch", { name: "审核并启用Research" }),
    );
    expect(setActivation).toHaveBeenCalledWith(
      expect.objectContaining({
        targetType: "package",
        targetId: "com.example.research",
        enabled: true,
      }),
    );
  });

  it("keeps a package disabled when Main rejects activation for an invalid contract", async () => {
    const catalog = catalogFixture();
    const list = vi.fn().mockResolvedValue({
      ...catalog,
      packages: catalog.packages.map((item) => ({
        ...item,
        enabledPreference: false,
        status: "disabled",
      })),
      tools: [],
      skills: [],
    });
    const setActivation = vi
      .fn()
      .mockRejectedValue(
        new Error("Tool Catalog contract failed: input schema is invalid"),
      );
    setRealmflow(createToolCatalog({ list, setActivation }));

    renderPage();
    const dialog = await openCatalogManagement();
    const toggle = await within(dialog).findByRole("switch", {
      name: "启用文件",
    });
    const listCallsBeforeToggle = list.mock.calls.length;
    fireEvent.click(toggle);

    await waitFor(() =>
      expect(setActivation).toHaveBeenCalledWith(
        expect.objectContaining({
          targetType: "package",
          targetId: "realmflow.builtin.files",
          enabled: true,
        }),
      ),
    );
    expect(await screen.findByText("无法更新启用状态")).toBeVisible();
    expect(
      screen.getByText(
        "本次操作未完成，已确认的数据保持不变。请检查相关配置后重试。",
      ),
    ).toBeVisible();
    await waitFor(() => expect(toggle).not.toBeDisabled());
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(list).toHaveBeenCalledTimes(listCallsBeforeToggle);
  });

  it("shows runtime unavailable diagnostics only in the management catalog", async () => {
    const catalog = catalogFixture();
    const unavailableTool: ToolCatalogDto["tools"][number] = {
      ...catalog.tools[0],
      id: "builtin.web.search",
      definitionDigest: "f".repeat(64),
      definition: {
        ...catalog.tools[0].definition,
        name: "Search web",
        description: "Search configured web providers.",
        capabilities: ["network.connect"],
      },
      status: "unavailable",
      runtimeEligibility: {
        status: "unavailable",
        reasonCode: "web_search_disabled",
        checkedAt: 1_000,
        expiresAt: 31_000,
        dependencyRevision: "web-provider:7",
      },
    };
    const list = vi.fn(
      async ({
        modelFacingMode,
      }: {
        locale: "zh-CN" | "en" | "ja";
        modelFacingMode?: "direct" | "facade" | "directory";
      }) =>
        modelFacingMode
          ? catalog
          : {
              ...catalog,
              tools: [...catalog.tools, unavailableTool],
            },
    );
    setRealmflow(createToolCatalog({ list }));

    renderPage();

    expect(await screen.findByText("文件系统")).toBeVisible();
    expect(screen.queryByText("Search web")).toBeNull();

    const dialog = await openCatalogManagement();

    expect(await within(dialog).findByText("Search web")).toBeVisible();
    expect(within(dialog).getByText("不可用")).toBeVisible();
    expect(within(dialog).getByText("web_search_disabled")).toBeVisible();
    expect(list).toHaveBeenLastCalledWith({ locale: "zh-CN" });
  });

  it("waits for Main when rolling a Plugin package back to an installed version", async () => {
    const catalog = catalogFixture();
    const changePackageVersion = vi.fn().mockResolvedValue(undefined);
    const packageBase = {
      packageId: "com.example.research",
      origin: "local_upload" as const,
      name: "Research",
      description: "Research Plugin.",
      enabledPreference: true,
      dependencyIssues: [],
      revision: 1,
      updatedAt: 100,
    };
    setRealmflow(
      createToolCatalog({
        list: vi.fn().mockResolvedValue({
          ...catalog,
          packages: [
            {
              ...packageBase,
              version: "1.0.0",
              packageDigest: "d".repeat(64),
              status: "superseded",
            },
            {
              ...packageBase,
              version: "2.0.0",
              packageDigest: "e".repeat(64),
              status: "enabled",
            },
          ],
          tools: [],
          skills: [],
        }),
        changePackageVersion,
      }),
    );

    renderPage();
    await openCatalogManagement();
    const version = await screen.findByRole("combobox", {
      name: "Research 版本",
    });
    expect(version).toHaveValue("2.0.0");
    fireEvent.change(version, { target: { value: "1.0.0" } });
    fireEvent.click(screen.getByRole("button", { name: "回滚 Research" }));

    expect(changePackageVersion).toHaveBeenCalledWith({
      packageId: "com.example.research",
      targetVersion: "1.0.0",
      operation: "rollback",
      idempotencyKey: expect.stringMatching(/^package-rollback-/),
    });
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

    expect(await screen.findByText("文件系统")).toBeVisible();
    const dialog = await openCatalogManagement();
    expect(await within(dialog).findByText("读取文件")).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: "模型可见" }));

    expect(await within(dialog).findByText("Ask user")).toBeVisible();
    expect(within(dialog).getByText("Secrets")).toBeVisible();
    expect(within(dialog).getByText("Sessions")).toBeVisible();
    expect(within(dialog).getByText("Subagents")).toBeVisible();
    expect(within(dialog).getByText("Progress card")).toBeVisible();
    expect(within(dialog).getByText("Capabilities")).toBeVisible();
    expect(await within(dialog).findByText("Filesystem read")).toBeVisible();
    expect(within(dialog).getAllByText("覆盖 0 个原子工具").length).toBeGreaterThanOrEqual(6);
    expect(within(dialog).getByText("覆盖 5 个原子工具")).toBeVisible();
    expect(within(dialog).getAllByText("最高风险：low").length).toBeGreaterThanOrEqual(1);
    expect(within(dialog).getByText("Document")).toBeVisible();
    expect(within(dialog).getByText("覆盖 15 个原子工具")).toBeVisible();
    expect(within(dialog).getAllByText("最高风险：medium").length).toBeGreaterThanOrEqual(1);
    expect(list).toHaveBeenLastCalledWith({
      locale: "zh-CN",
      modelFacingMode: "facade",
    });

    fireEvent.click(within(dialog).getByRole("button", { name: "原子工具" }));

    expect(await within(dialog).findByText("读取文件")).toBeVisible();
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
    const dialog = await openCatalogManagement();
    fireEvent.click(within(dialog).getByRole("button", { name: "目录检索" }));

    expect(await within(dialog).findByText("Tool search")).toBeVisible();
    expect(within(dialog).getByText("Tool describe")).toBeVisible();
    expect(within(dialog).getByText("Tool call")).toBeVisible();
    expect(within(dialog).getByText("Ask user")).toBeVisible();
    expect(within(dialog).getByText("Progress card")).toBeVisible();
    expect(within(dialog).getAllByText("覆盖 0 个原子工具").length).toBeGreaterThanOrEqual(6);
    expect(within(dialog).getByText("Read file")).toBeVisible();
    expect(within(dialog).getAllByText("目录检索").length).toBeGreaterThanOrEqual(2);
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
        contract: { status: "passed", diagnostics: [] },
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
    expect(within(importDialog).getByText("能力契约")).toBeVisible();
    expect(within(importDialog).getByText("已通过")).toBeVisible();
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
    expect(await screen.findAllByText("Review Agent")).not.toHaveLength(0);
    expect(
      screen.getByRole("button", { name: /Review Agent Reviews changes/ }),
    ).toBeVisible();
    expect(
      screen.queryByRole("region", { name: "已安装能力" }),
    ).not.toBeInTheDocument();
  });

  it("waits for Main when enabling, upgrading, and rolling back a Connector capability", async () => {
    const version1 = connectorCapabilityFixture(
      "database.analytics",
      "Analytics Connector",
      "database",
      1,
      "enabled",
    ).definition;
    const version2 = {
      ...version1,
      version: "2.0.0",
      definitionDigest: "a".repeat(64),
    };
    const disabled = {
      id: "installation-database-analytics",
      capabilityId: version1.id,
      capabilityVersion: version1.version,
      capabilityDigest: version1.definitionDigest,
      scope: { kind: "global" as const },
      enabled: false,
      permissionCeiling: version1.permissions,
      status: "installed_disabled" as const,
      revision: 1,
      installedAt: 100,
      updatedAt: 100,
    };
    const enabled = {
      ...disabled,
      enabled: true,
      status: "enabled" as const,
      revision: 2,
    };
    const upgraded = {
      ...enabled,
      capabilityVersion: version2.version,
      capabilityDigest: version2.definitionDigest,
      revision: 3,
    };
    const rolledBack = {
      ...enabled,
      revision: 4,
    };
    let resolveEnabled!: (value: typeof enabled) => void;
    const setEnabled = vi.fn().mockReturnValue(
      new Promise<typeof enabled>((resolve) => {
        resolveEnabled = resolve;
      }),
    );
    const changeVersion = vi
      .fn()
      .mockResolvedValueOnce(upgraded)
      .mockResolvedValueOnce(rolledBack);
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
    renderPage("/capabilities?tab=connectors&connectorKind=database");

    const activation = await screen.findByRole("switch", {
      name: "启用Analytics Connector",
    });

    fireEvent.click(activation);

    expect(activation).toHaveAttribute("aria-checked", "false");
    await waitFor(() => expect(activation).toBeDisabled());
    resolveEnabled(enabled);
    await waitFor(() =>
      expect(activation).toHaveAttribute("aria-checked", "true"),
    );

    const version = screen.getByRole("combobox", {
      name: "Analytics Connector 版本",
    });
    fireEvent.change(version, { target: { value: "2.0.0" } });
    fireEvent.click(
      screen.getByRole("button", { name: "升级 Analytics Connector" }),
    );
    await waitFor(() =>
      expect(changeVersion).toHaveBeenCalledWith({
        installationId: "installation-database-analytics",
        targetVersion: "2.0.0",
        expectedRevision: 2,
        operation: "upgrade",
      }),
    );

    fireEvent.change(version, { target: { value: "1.0.0" } });
    fireEvent.click(
      await screen.findByRole("button", {
        name: "回滚 Analytics Connector",
      }),
    );
    await waitFor(() =>
      expect(changeVersion).toHaveBeenLastCalledWith({
        installationId: "installation-database-analytics",
        targetVersion: "1.0.0",
        expectedRevision: 3,
        operation: "rollback",
      }),
    );
  });

  it("keeps capability filters out of Agents while preserving query state for Tools", async () => {
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

    expect(await screen.findByRole("searchbox", { name: "搜索智能体" })).toHaveValue(
      "review",
    );
    expect(
      screen.queryByRole("searchbox", { name: "搜索能力" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "来源" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "安装作用域" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "启用状态" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "风险等级" }),
    ).not.toBeInTheDocument();

    expect(await screen.findAllByText("Review Agent")).not.toHaveLength(0);
    fireEvent.change(screen.getByRole("searchbox", { name: "搜索智能体" }), {
      target: { value: "missing" },
    });
    expect(screen.queryByText("Review Agent")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "搜索智能体" }), {
      target: { value: "review" },
    });
    expect(screen.getAllByText("Review Agent").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("tab", { name: "工具" }));
    expect(screen.getByRole("searchbox", { name: "搜索工具" })).toHaveValue(
      "review",
    );
  });

  it("restores catalog origin and connector kind selections from the URL", async () => {
    setRealmflow(createToolCatalog());

    const tools = renderPage("/capabilities?origin=mcp");
    await openCatalogManagement();
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
    const dialog = await openCatalogManagement();
    const toggle = await within(dialog).findByRole("switch", {
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

    const dialog = await openCatalogManagement();
    fireEvent.click(
      await within(dialog).findByRole("switch", { name: "停用读取文件" }),
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

    const dialog = await openCatalogManagement();
    fireEvent.click(
      await within(dialog).findByRole("button", { name: "导入压缩包" }),
    );

    expect(await screen.findByText("无法导入扩展包")).toBeVisible();
    expect(document.querySelector(".model-page-error")).toBeNull();
    expect(
      screen.queryByText("archive contained SECRET_TOKEN"),
    ).not.toBeInTheDocument();
  });

  it("shows safe contract diagnostics when Main rejects an imported package", async () => {
    const diagnostic =
      "Tool com.example.search input schema.properties.query.description is required";
    const toolCatalog = createToolCatalog({
      chooseAndImport: vi
        .fn()
        .mockRejectedValue(
          new Error(`Tool Catalog contract failed: ${diagnostic}`),
        ),
    });
    setRealmflow(toolCatalog);
    renderPage();

    const dialog = await openCatalogManagement();
    fireEvent.click(
      await within(dialog).findByRole("button", { name: "导入压缩包" }),
    );

    await waitFor(() => {
      expect(toolCatalog.chooseAndImport).toHaveBeenCalled();
    });
    expect(
      await screen.findByText(`无法导入扩展包：${diagnostic}`),
    ).toBeVisible();
    expect(document.querySelector(".model-page-error")).toBeNull();
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

function legacyCapabilityFixture(input: {
  id: string;
  kind: "tool" | "skill";
  name: string;
  runtime: Record<string, unknown>;
}) {
  const definition = {
    schemaVersion: 1,
    id: input.id,
    kind: input.kind,
    version: "1.0.0",
    source: "builtin",
    manifestDigest: "a".repeat(64),
    definitionDigest: "b".repeat(64),
    name: input.name,
    description: `${input.name} legacy projection`,
    runtime: input.runtime,
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
  };
  return {
    definition,
    installation: {
      id: `installation.${input.id}`,
      capabilityId: input.id,
      capabilityVersion: "1.0.0",
      capabilityDigest: definition.definitionDigest,
      scope: { kind: "global" },
      enabled: true,
      permissionCeiling: definition.permissions,
      status: "enabled",
      revision: 1,
      installedAt: 100,
      updatedAt: 100,
    },
  };
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

async function openCatalogManagement(): Promise<HTMLElement> {
  fireEvent.click(screen.getByRole("button", { name: "添加能力" }));
  fireEvent.click(
    await screen.findByRole("menuitem", {
      name: "管理扩展包与原子目录",
    }),
  );
  const dialog = await screen.findByRole("dialog", {
    name: "扩展包与原子目录",
  });
  expect(dialog).toBeVisible();
  return dialog;
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
    changePackageVersion: vi.fn(),
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
            "builtin.document.deliver_pdf",
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
