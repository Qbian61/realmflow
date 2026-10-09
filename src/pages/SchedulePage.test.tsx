import {
  fireEvent,
  render as testingRender,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type {
  BusinessApi,
  ConnectorDto,
  ScheduleDto,
  ScheduleRunDto,
  SkillCatalogDto,
  SpaceDto,
} from "../../shared/business";
import type { ModelProfile, ModelProvider } from "../../domain/model";
import { ToastProvider } from "../features/toast/ToastProvider";
import { LocalizationProvider } from "../localization/LocalizationProvider";
import SchedulePage from "./SchedulePage";

function render(
  ui: Parameters<typeof testingRender>[0],
  storage?: Storage,
  initialEntry = "/schedule",
): ReturnType<typeof testingRender> {
  return testingRender(
    <MemoryRouter initialEntries={[initialEntry]}>
      <LocalizationProvider storage={storage}>
        <ToastProvider>{ui}</ToastProvider>
      </LocalizationProvider>
    </MemoryRouter>,
  );
}

function openScheduledTasks(): void {
  const tabs = within(screen.getByRole("tablist")).getAllByRole("tab");
  fireEvent.click(tabs[1]!);
}

const schedule: ScheduleDto = {
  id: "schedule-1",
  name: "Daily summary",
  description: "Summarize project status",
  cronExpression: "0 9 * * 1-5",
  timeZone: "Asia/Shanghai",
  missedRunPolicy: "skip",
  status: "active",
  workspaceId: "workspace-1",
  modelProfileId: "model-profile-1",
  executionTarget: {
    kind: "skill" as const,
    id: "skill-1",
    version: "1.0.0",
    digest: "a".repeat(64),
  },
  skillInput: { audience: "team" },
  connectorBindings: [{ service: "issues", connectorId: "connector-1" }],
  permissions: ["filesystem.read"],
  revision: 1,
  createdAt: 100,
  updatedAt: 100,
  nextRunAt: 1_800_000_000_000,
};

describe("SchedulePage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete window.realmflow;
  });

  it("restores the active tab from a deep link and rejects invalid values", async () => {
    installBusiness(createBusiness());

    const page = render(
      <SchedulePage />,
      undefined,
      "/schedule?tab=schedules",
    );

    expect(
      await screen.findByRole("tab", { name: "进行中任务 (1)" }),
    ).toHaveAttribute("aria-selected", "true");

    page.unmount();
    render(<SchedulePage />, undefined, "/schedule?tab=unknown");

    expect(screen.getByRole("tab", { name: "任务模板" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("uses the shared page, toolbar, badge and empty state primitives", async () => {
    const business = createBusiness([]);
    installBusiness(business);

    const page = render(<SchedulePage />);

    expect(page.container.firstElementChild).toHaveClass("schedule-page");
    expect(page.container.firstElementChild).not.toHaveClass("ui-page");
    expect(page.container.querySelector(".schedule-content")).toHaveClass(
      "ui-page__body",
      "ui-page__body--wide",
    );
    expect(screen.getByRole("toolbar", { name: "定时任务视图" })).toHaveClass(
      "ui-toolbar",
      "ui-toolbar--workspace-header",
    );
    expect(screen.getByRole("button", { name: "新建任务" })).toHaveClass(
      "ui-button",
      "ui-button--primary",
    );

    openScheduledTasks();
    expect(
      (await screen.findByText("尚未创建定时任务")).closest(".ui-empty-state"),
    ).toBeTruthy();
  });

  it("hides raw IPC failures behind the localized load error", async () => {
    installBusiness(createBusiness());
    vi.mocked(window.realmflow!.toolCatalog.list).mockRejectedValue(
      new Error(
        "Error invoking remote method 'tool-catalog:list': Invalid IPC payload",
      ),
    );

    render(<SchedulePage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "定时任务加载失败",
    );
    expect(
      screen.queryByText(/Error invoking remote method/),
    ).not.toBeInTheDocument();
    expect(window.realmflow?.toolCatalog.list).toHaveBeenCalledWith({
      locale: "zh-CN",
    });
  });

  it("separates task templates and scheduled tasks into header tabs", async () => {
    const business = createBusiness();
    installBusiness(business);

    render(<SchedulePage />);

    const templatesTab = screen.getByRole("tab", { name: "任务模板" });
    const schedulesTab = await screen.findByRole("tab", {
      name: "进行中任务 (1)",
    });

    expect(screen.getByRole("tablist")).toHaveClass(
      "ui-tab-list",
      "ui-tab-list--page",
    );
    expect(screen.getByRole("tablist").parentElement).toHaveClass(
      "ui-tabs",
      "ui-tabs--page",
    );
    templatesTab.focus();
    fireEvent.keyDown(templatesTab, { key: "ArrowRight" });
    expect(schedulesTab).toHaveFocus();
    expect(templatesTab).toHaveAttribute("aria-selected", "true");
    expect(templatesTab).toHaveAttribute("aria-selected", "true");
    expect(schedulesTab).toHaveAttribute("aria-selected", "false");
    expect(
      screen.getByRole("heading", { level: 1, name: "定时任务" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("管理本地自动化的执行周期、绑定和运行状态。"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "为你推荐" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "工作周报" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Daily summary" }),
    ).not.toBeInTheDocument();

    fireEvent.click(schedulesTab);

    expect(templatesTab).toHaveAttribute("aria-selected", "false");
    expect(schedulesTab).toHaveAttribute("aria-selected", "true");
    expect(
      await screen.findByRole("heading", { name: "Daily summary" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "进行中" }),
    ).not.toBeInTheDocument();
  });

  it("places the create action in the schedule header", async () => {
    const business = createBusiness();
    installBusiness(business);

    render(<SchedulePage />);
    await screen.findByRole("tab", { name: "进行中任务 (1)" });

    const createButton = screen.getByRole("button", { name: "新建任务" });
    expect(createButton.closest(".schedule-page-header")).not.toBeNull();
    expect(createButton.closest(".schedule-heading")).toBeNull();

    fireEvent.click(createButton);
    const dialog = screen.getByRole("dialog", { name: "新建定时任务" });
    expect(dialog).toHaveClass("ui-dialog", "ui-dialog--wide");
    expect(dialog.parentElement).toHaveClass("ui-dialog-backdrop");
    expect(
      within(dialog)
        .getByRole("textbox", { name: "任务名称" })
        .closest(".ui-field"),
    ).not.toBeNull();
    expect(
      within(dialog).getByRole("button", { name: "创建任务" }),
    ).toHaveClass("ui-button", "ui-button--primary");
  });

  it("loads schedules and all explicit binding options in parallel", async () => {
    const business = createBusiness();
    installBusiness(business);

    render(<SchedulePage />);
    openScheduledTasks();

    expect(screen.getByText("正在加载定时任务…")).toBeInTheDocument();
    const scheduleHeading = await screen.findByRole("heading", {
      name: "Daily summary",
    });
    expect(scheduleHeading.closest("article")).toHaveClass(
      "ui-card",
      "ui-card--compact",
    );
    expect(screen.getByText("运行中")).toHaveClass(
      "ui-badge",
      "ui-badge--success",
    );
    expect(screen.getByText("工作空间：Planning")).toBeInTheDocument();
    expect(screen.getByText("模型：Local model")).toBeInTheDocument();
    expect(
      screen.getByText("Skill：Issue summary · 1.0.0"),
    ).toBeInTheDocument();
    expect(screen.getByText("0 9 * * 1-5 · Asia/Shanghai")).toBeInTheDocument();
    expect(
      screen.getByText(
        `下一次运行：${new Date(schedule.nextRunAt!).toLocaleString()}`,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "暂停 Daily summary" }),
    ).toBeInTheDocument();

    expect(business.listSchedules).toHaveBeenCalledOnce();
    expect(business.listScheduleRuns).toHaveBeenCalledWith({ limit: 50 });
    expect(business.listSpaces).toHaveBeenCalledOnce();
    expect(business.listModels).toHaveBeenCalledOnce();
    expect(window.realmflow?.toolCatalog.list).toHaveBeenCalledOnce();
    expect(business.listConnectors).toHaveBeenCalledOnce();
  });

  it("renders schedule controls in Japanese without translating task data", async () => {
    const business = createBusiness();
    installBusiness(business);

    render(<SchedulePage />, storageWithLocale("ja"));
    openScheduledTasks();

    expect(
      await screen.findByRole("tab", { name: "実行中のタスク (1)" }),
    ).toBeVisible();
    expect(
      await screen.findByRole("heading", { name: "Daily summary" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Daily summaryを一時停止" }),
    ).toBeVisible();
  });

  it("prefills a recommendation and only persists after explicit submit", async () => {
    const business = createBusiness([]);
    vi.mocked(business.listSchedules)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([schedule]);
    installBusiness(business);

    render(<SchedulePage />);
    const recommendationHeading = await screen.findByRole("heading", {
      name: "工作周报",
    });
    expect(recommendationHeading.closest("article")).toHaveClass(
      "ui-card",
      "ui-card--compact",
      "ui-card--interactive",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "使用推荐任务 工作周报" }),
    );
    const dialog = screen.getByRole("dialog", { name: "新建定时任务" });
    expect(
      within(dialog).getByRole("textbox", { name: "任务名称" }),
    ).toHaveValue("工作周报");
    expect(
      within(dialog).getByRole("combobox", { name: "错过执行策略" }),
    ).toHaveValue("skip");
    expect(business.createSchedule).not.toHaveBeenCalled();

    fireEvent.change(
      within(dialog).getByRole("textbox", { name: "Skill 输入 JSON" }),
      { target: { value: '{"audience":"team"}' } },
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "创建任务" }));

    await waitFor(() => expect(business.createSchedule).toHaveBeenCalledOnce());
    expect(business.createSchedule).toHaveBeenCalledWith({
      definition: {
        name: "工作周报",
        description: "自动汇总本周工作进展，一键生成周报",
        cronExpression: "0 18 * * 5",
        timeZone: "Asia/Shanghai",
        missedRunPolicy: "skip",
        workspaceId: "workspace-1",
        modelProfileId: "model-profile-1",
        executionTarget: {
          kind: "skill" as const,
          id: "skill-1",
          version: "1.0.0",
          digest: "a".repeat(64),
        },
        skillInput: { audience: "team" },
        connectorBindings: [],
        permissions: [],
      },
      idempotencyKey: expect.stringMatching(/^schedule-create:/),
    });
    expect(
      await screen.findByRole("heading", { name: "Daily summary" }),
    ).toBeInTheDocument();
  });

  it("prefills and persists the missed-run policy when editing", async () => {
    const runOnceSchedule = {
      ...schedule,
      missedRunPolicy: "run_once" as const,
    };
    const business = createBusiness([runOnceSchedule]);
    vi.mocked(business.updateSchedule).mockResolvedValueOnce({
      outcome: "saved",
      schedule: { ...runOnceSchedule, missedRunPolicy: "skip", revision: 2 },
    });
    installBusiness(business);

    render(<SchedulePage />);
    openScheduledTasks();
    await screen.findByRole("heading", { name: "Daily summary" });
    fireEvent.click(screen.getByRole("button", { name: "编辑 Daily summary" }));

    const dialog = screen.getByRole("dialog", { name: "编辑定时任务" });
    const policy = within(dialog).getByRole("combobox", {
      name: "错过执行策略",
    });
    expect(policy).toHaveValue("run_once");
    fireEvent.change(policy, { target: { value: "skip" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "保存修改" }));

    await waitFor(() => expect(business.updateSchedule).toHaveBeenCalledOnce());
    expect(business.updateSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        id: schedule.id,
        expectedRevision: schedule.revision,
        definition: expect.objectContaining({ missedRunPolicy: "skip" }),
      }),
    );
  });

  it("shows the policy and latest recovery decision in the task list", async () => {
    const decidedAt = 1_700_000_000_000;
    const missedDueAt = 1_699_999_000_000;
    const business = createBusiness([
      {
        ...schedule,
        missedRunPolicy: "run_once",
        lastRecoveryDecision: {
          scheduleId: schedule.id,
          scheduleRevision: schedule.revision,
          missedDueAt,
          policy: "run_once",
          action: "run_once",
          runId: "schedule-run-recovery",
          decidedAt,
        },
      },
    ]);
    installBusiness(business);

    render(<SchedulePage />);
    openScheduledTasks();
    await screen.findByRole("heading", { name: "Daily summary" });

    expect(screen.getByText("错过执行：补跑一次")).toBeInTheDocument();
    expect(
      screen.getByText(`错过时刻：${new Date(missedDueAt).toLocaleString()}`),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        `最近恢复：已补跑 · ${new Date(decidedAt).toLocaleString()}`,
      ),
    ).toBeInTheDocument();
  });

  it("keeps the last successful list and toasts a safe update failure", async () => {
    const business = createBusiness();
    vi.mocked(business.pauseSchedule).mockRejectedValueOnce(
      new Error("/Users/private/schedules.db revision conflict"),
    );
    installBusiness(business);

    render(<SchedulePage />);
    openScheduledTasks();
    await screen.findByRole("heading", { name: "Daily summary" });
    fireEvent.click(screen.getByRole("button", { name: "暂停 Daily summary" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("任务状态更新失败");
    expect(alert).toHaveClass("toast-message");
    expect(alert).not.toHaveTextContent("/Users/private/schedules.db");
    expect(
      screen.getByRole("heading", { name: "Daily summary" }),
    ).toBeInTheDocument();
    expect(business.listSchedules).toHaveBeenCalledOnce();
  });

  it("toasts a safe create failure and keeps the editor open", async () => {
    const business = createBusiness([]);
    vi.mocked(business.createSchedule).mockRejectedValueOnce(
      new Error("token=secret create failed"),
    );
    installBusiness(business);

    render(<SchedulePage />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "使用推荐任务 工作周报",
      }),
    );
    const dialog = screen.getByRole("dialog", { name: "新建定时任务" });
    fireEvent.click(within(dialog).getByRole("button", { name: "创建任务" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("定时任务保存失败");
    expect(alert).toHaveClass("toast-message");
    expect(alert).not.toHaveTextContent("token=secret");
    expect(dialog).toBeVisible();
  });

  it("toasts a safe run failure and preserves execution history", async () => {
    const business = createBusiness();
    vi.mocked(business.listScheduleRuns).mockResolvedValueOnce([
      run("existing-run", "manual"),
    ]);
    vi.mocked(business.runScheduleNow).mockRejectedValueOnce(
      new Error("runner stack trace"),
    );
    installBusiness(business);

    render(<SchedulePage />);
    openScheduledTasks();
    await screen.findByTestId("schedule-run-existing-run");
    fireEvent.click(
      screen.getByRole("button", { name: "立即执行 Daily summary" }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("任务执行失败");
    expect(alert).toHaveClass("toast-message");
    expect(alert).not.toHaveTextContent("runner stack trace");
    expect(screen.getByTestId("schedule-run-existing-run")).toBeVisible();
  });

  it("toasts a safe delete failure and keeps the schedule visible", async () => {
    const business = createBusiness();
    vi.mocked(business.deleteSchedule).mockRejectedValueOnce(
      new Error("/private/schedule-delete.log"),
    );
    installBusiness(business);

    render(<SchedulePage />);
    openScheduledTasks();
    await screen.findByRole("heading", { name: "Daily summary" });
    fireEvent.click(screen.getByRole("button", { name: "删除 Daily summary" }));
    fireEvent.click(
      screen.getByRole("button", { name: "删除", hidden: false }),
    );

    const alert = (await screen.findAllByRole("alert")).find((candidate) =>
      candidate.classList.contains("toast-message"),
    );
    expect(alert).toBeDefined();
    expect(alert).toHaveTextContent("任务删除失败");
    expect(alert).toHaveClass("toast-message");
    expect(alert).not.toHaveTextContent("/private/schedule-delete.log");
    expect(
      screen.getByRole("heading", { name: "Daily summary" }),
    ).toBeVisible();
  });

  it("keeps a schedule when delete confirmation is cancelled", async () => {
    const business = createBusiness();
    installBusiness(business);

    render(<SchedulePage />);
    openScheduledTasks();
    await screen.findByRole("heading", { name: "Daily summary" });
    fireEvent.click(screen.getByRole("button", { name: "删除 Daily summary" }));

    expect(screen.getByRole("dialog")).toHaveTextContent(
      "删除“Daily summary”？",
    );
    expect(screen.getByRole("button", { name: "取消" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    expect(business.deleteSchedule).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "Daily summary" }),
    ).toBeVisible();
  });

  it("omits the next-run time for paused schedules", async () => {
    const business = createBusiness([{ ...schedule, status: "paused" }]);
    installBusiness(business);

    render(<SchedulePage />);
    openScheduledTasks();
    await screen.findByRole("heading", { name: "Daily summary" });

    expect(screen.queryByText(/下一次运行：/)).not.toBeInTheDocument();
  });

  it("distinguishes automatic and manual runs in history", async () => {
    const business = createBusiness();
    vi.mocked(business.listScheduleRuns).mockResolvedValueOnce([
      run("cron-run", "cron", 180),
      run("manual-run", "manual"),
    ]);
    installBusiness(business);

    render(<SchedulePage />);
    openScheduledTasks();
    const automatic = await screen.findByTestId("schedule-run-cron-run");
    const manual = screen.getByTestId("schedule-run-manual-run");

    expect(within(automatic).getByText("自动")).toBeInTheDocument();
    expect(within(automatic).getByText("计划于")).toBeInTheDocument();
    expect(within(manual).getByText("手动")).toBeInTheDocument();
    expect(within(manual).queryByText("计划于")).not.toBeInTheDocument();
  });
});

function createBusiness(schedules: ScheduleDto[] = [schedule]): BusinessApi {
  const provider: ModelProvider & { revision: number } = {
    id: "provider-1",
    type: "local",
    name: "Local",
    baseUrl: "http://127.0.0.1",
    enabled: true,
    revision: 1,
  };
  const profile: ModelProfile & { revision: number } = {
    id: "model-profile-1",
    providerId: provider.id,
    modelId: "local-model",
    displayName: "Local model",
    enabled: true,
    capabilities: {
      text: true,
      vision: false,
      toolCalling: false,
      structuredOutput: false,
    },
    contextWindow: 4096,
    timeoutMs: 30_000,
    maxRetries: 1,
    maxConcurrency: 1,
    inputCostPerMillionTokens: 0,
    outputCostPerMillionTokens: 0,
    revision: 1,
  };
  const space: SpaceDto = {
    id: "workspace-1",
    path: "/workspace",
    label: "Planning",
    description: "",
    sortOrder: 0,
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
  };
  const connector: ConnectorDto = {
    connector: {
      id: "connector-1",
      name: "Issues",
      type: "http",
      baseUrl: "https://issues.example.com",
      authentication: { type: "none" },
      enabled: true,
      timeoutMs: 5_000,
      maxRetries: 1,
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
      validation: {
        status: "available",
        checkedAt: 1,
        message: "Available",
      },
    },
    hasCredential: false,
  };
  const skill: SkillCatalogDto = {
    skill: {
      id: "skill-1",
      enabled: true,
      currentVersionId: "skill-version-1",
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
    },
    versions: [
      {
        id: "skill-version-1",
        skillId: "skill-1",
        version: "1.0.0",
        name: "Issue summary",
        description: "",
        entry: { kind: "prompt", path: "prompt.md" },
        inputSchema: { type: "object" },
        outputSchema: { type: "object" },
        permissions: ["filesystem.read"],
        network: { required: true, services: ["issues"] },
        resources: {
          timeoutMs: 30_000,
          maxMemoryMb: 128,
          maxOutputBytes: 1024,
        },
        source: { type: "local_directory", displayName: "issue-summary" },
        checksum: "a".repeat(64),
        byteSize: 100,
        fileCount: 1,
        installedAt: 1,
        integrity: {
          status: "verified",
          checkedAt: 1,
          message: "Verified",
        },
      },
    ],
  };
  return {
    listSchedules: vi.fn().mockResolvedValue(schedules),
    listScheduleRuns: vi.fn().mockResolvedValue([]),
    listSpaces: vi.fn().mockResolvedValue([space]),
    listModels: vi.fn().mockResolvedValue({
      providers: [provider],
      profiles: [profile],
    }),
    listConnectors: vi.fn().mockResolvedValue([connector]),
    createSchedule: vi.fn().mockResolvedValue({
      outcome: "saved",
      schedule,
    }),
    updateSchedule: vi.fn(),
    pauseSchedule: vi.fn().mockResolvedValue({
      outcome: "saved",
      schedule: { ...schedule, status: "paused", revision: 2 },
    }),
    resumeSchedule: vi.fn(),
    runScheduleNow: vi.fn(),
    deleteSchedule: vi.fn(),
  } as unknown as BusinessApi;
}

function installBusiness(business: BusinessApi): void {
  window.realmflow = {
    business,
    toolCatalog: {
      list: vi.fn().mockResolvedValue({
        packages: [],
        tools: [],
        skills: [
          {
            kind: "skill",
            id: "skill-1",
            version: "1.0.0",
            definitionDigest: "a".repeat(64),
            definition: {
              name: "Issue summary",
              description: "Summarize issues",
              origin: "local_upload",
              instructionsPath: "prompt.md",
              runtime: { kind: "instruction" },
              inputSchema: { type: "object" },
              outputSchema: { type: "object" },
              requiredTools: [],
              activation: { intents: [], contexts: [] },
              limits: {
                maxToolCalls: 4,
                timeoutMs: 30_000,
              },
            },
            enabledPreference: true,
            status: "enabled",
            dependencyIssues: [],
            revision: 1,
            updatedAt: 1,
          },
        ],
      }),
      chooseAndImport: vi.fn(),
      setActivation: vi.fn(),
    } as never,
  } as unknown as Window["realmflow"];
}

function run(
  id: string,
  triggerSource: ScheduleRunDto["triggerSource"],
  scheduledFor?: number,
): ScheduleRunDto {
  return {
    id,
    scheduleId: schedule.id,
    scheduleRevision: schedule.revision,
    scheduleName: schedule.name,
    triggerSource,
    status: "succeeded",
    toolExecutionId: `skill-execution-${id}`,
    ...(scheduledFor === undefined ? {} : { scheduledFor }),
    startedAt: 200,
    finishedAt: 210,
    revision: 2,
  };
}

function storageWithLocale(locale: "en" | "ja"): Storage {
  return {
    getItem: vi.fn(() => JSON.stringify({ version: 1, locale })),
    setItem: vi.fn(),
  } as unknown as Storage;
}
