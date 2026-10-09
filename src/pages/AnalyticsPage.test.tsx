import {
  fireEvent,
  render as testingRender,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, vi } from "vitest";
import type { BusinessApi } from "../../shared/business";
import type {
  ModelStatisticsResult,
  ModelStatisticsSummary,
} from "../../shared/model-statistics";
import type { ProductAnalyticsResult } from "../../shared/product-analytics";
import { LocalizationProvider } from "../localization/LocalizationProvider";
import AnalyticsPage from "./AnalyticsPage";

function render(
  ui: Parameters<typeof testingRender>[0],
  storage: Storage = window.localStorage,
): ReturnType<typeof testingRender> {
  return testingRender(
    <LocalizationProvider storage={storage}>{ui}</LocalizationProvider>,
  );
}

const summary: ModelStatisticsSummary = {
  calls: 3,
  inputTokens: 8_000,
  outputTokens: 2_000,
  cachedTokens: 1_000,
  reasoningTokens: 500,
  totalTokens: 11_500,
  averageFirstTokenLatencyMs: 300,
  averageDurationMs: 1_200,
  averageThroughputTokensPerSecond: 42.5,
  successRate: 200 / 3,
  retries: 2,
  estimatedInputCost: 0.016,
  estimatedOutputCost: 0.032,
  estimatedCost: 0.048,
};

function result(label = "GPT 4.1"): ModelStatisticsResult {
  return {
    summary,
    trend: [
      { bucketStart: 1_000, bucketEnd: 2_000, summary },
      {
        bucketStart: 2_000,
        bucketEnd: 3_000,
        summary: { ...summary, calls: 0 },
      },
    ],
    groups: [{ key: "model-1", label, summary }],
    options: {
      providers: [{ id: "provider-1", label: "OpenAI" }],
      models: [{ id: "model-1", label: "GPT 4.1" }],
      workspaces: [{ id: "workspace-1", label: "RealmFlow" }],
      requirements: [{ id: "requirement-1", label: "统计查询" }],
      nodes: [{ id: "node-1", label: "实现" }],
      conversations: [{ id: "conversation-1", label: "实现讨论" }],
    },
  };
}

const productResult: ProductAnalyticsResult = {
  scope: { workspaces: [{ id: "workspace-1", label: "RealmFlow" }] },
  summary: {
    workspaces: 1,
    requirements: 2,
    workflows: 2,
    executions: 3,
    nodeRuns: 4,
  },
  requirements: [
    { status: "pending", count: 1 },
    { status: "active", count: 1 },
    { status: "completed", count: 0 },
  ],
  workflows: [{ templateId: "template-1", label: "Delivery", count: 2 }],
  executionStatuses: [
    { status: "created", count: 0 },
    { status: "running", count: 1 },
    { status: "waiting_user", count: 0 },
    { status: "paused", count: 0 },
    { status: "completed", count: 1 },
    { status: "failed", count: 1 },
    { status: "cancelled", count: 0 },
    { status: "interrupted", count: 0 },
  ],
  nodeRunStatuses: [
    { status: "pending", count: 0 },
    { status: "ready", count: 1 },
    { status: "running", count: 1 },
    { status: "waiting_user", count: 0 },
    { status: "paused", count: 0 },
    { status: "blocked", count: 0 },
    { status: "completed", count: 2 },
    { status: "failed", count: 0 },
    { status: "skipped", count: 0 },
    { status: "cancelled", count: 0 },
    { status: "interrupted", count: 0 },
  ],
  recentActivity: [],
};

function setup(queryModelStatistics = vi.fn().mockResolvedValue(result())): {
  business: BusinessApi;
  queryModelStatistics: typeof queryModelStatistics;
  queryProductAnalytics: ReturnType<typeof vi.fn>;
} {
  const queryProductAnalytics = vi.fn().mockResolvedValue(productResult);
  const business = {
    queryModelStatistics,
    queryProductAnalytics,
  } as unknown as BusinessApi;
  window.realmflow = { business } as unknown as typeof window.realmflow;
  return { business, queryModelStatistics, queryProductAnalytics };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("AnalyticsPage", () => {
  afterEach(() => {
    delete window.realmflow;
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("uses the shared page, metric, toolbar and inline alert primitives", async () => {
    const { business } = setup();
    const page = render(<AnalyticsPage />);

    expect(page.container.firstElementChild).toHaveClass("analytics-page");
    expect(page.container.firstElementChild).not.toHaveClass("ui-page");
    expect(page.container.querySelector(".analytics-page-content")).toHaveClass(
      "ui-page__body",
      "ui-page__body--wide",
    );
    await screen.findByRole("region", { name: "产品活动总览" });
    expect(
      page.container.querySelectorAll(".ui-metric").length,
    ).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("tab", { name: "模型调用" }));
    expect(
      await screen.findByRole("toolbar", { name: "模型统计筛选" }),
    ).toHaveClass("ui-toolbar");

    vi.mocked(business.queryModelStatistics).mockRejectedValueOnce(
      new Error("private analytics failure"),
    );
    fireEvent.change(screen.getByLabelText("时间范围"), {
      target: { value: "7d" },
    });
    expect(await screen.findByRole("alert")).toHaveClass(
      "ui-inline-alert",
      "ui-inline-alert--danger",
    );
  });

  it("defaults to product activity and persists the selected view", async () => {
    const { queryModelStatistics, queryProductAnalytics } = setup();

    render(<AnalyticsPage />);

    const productTab = screen.getByRole("tab", { name: "产品活动" });
    const modelTab = screen.getByRole("tab", { name: "模型调用" });
    expect(screen.getByRole("tablist")).toHaveClass(
      "ui-tab-list",
      "ui-tab-list--page",
    );
    expect(screen.getByRole("tablist").parentElement).toHaveClass(
      "ui-tabs",
      "ui-tabs--page",
    );
    productTab.focus();
    fireEvent.keyDown(productTab, { key: "ArrowRight" });
    expect(modelTab).toHaveFocus();
    expect(productTab).toHaveAttribute("aria-selected", "true");
    expect(productTab.closest(".analytics-page-header")).not.toBeNull();
    expect(productTab).toHaveAttribute(
      "aria-controls",
      "analytics-product-panel",
    );
    expect(
      await screen.findByRole("region", { name: "产品活动总览" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tabpanel", { name: "产品活动" })).toHaveAttribute(
      "id",
      "analytics-product-panel",
    );
    expect(queryProductAnalytics).toHaveBeenCalledWith({ activityLimit: 12 });
    expect(queryModelStatistics).not.toHaveBeenCalled();

    fireEvent.click(modelTab);
    expect(
      screen.queryByRole("tabpanel", { name: "产品活动" }),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByRole("region", { name: "模型调用总览" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tabpanel", { name: "模型调用" })).toHaveAttribute(
      "id",
      "analytics-models-panel",
    );
    expect(
      JSON.parse(
        window.localStorage.getItem("realmflow:analytics-view:v1") ?? "{}",
      ),
    ).toMatchObject({ version: 1, view: "models" });
  });

  it("opens the Runtime governance view through the typed preload API", async () => {
    setup();
    const getSnapshot = vi.fn().mockResolvedValue({
      revision: 1,
      summary: {
        totalRuns: 0,
        completedRuns: 0,
        failedRuns: 0,
        recoveryRate: 0,
        permissionWaits: 0,
        averageDurationMs: null,
      },
      failedRuns: [],
      evaluations: [],
      capabilities: [],
      observability: {
        retentionDays: 30,
        maximumEvents: 50_000,
        droppedEvents: 0,
        storedEvents: 0,
      },
    });
    Object.assign(window.realmflow ?? {}, {
      runtimeGovernance: {
        getSnapshot,
        getRunDetail: vi.fn(),
        runEvaluation: vi.fn(),
        release: vi.fn(),
        exportDiagnostic: vi.fn(),
      },
    });

    render(<AnalyticsPage />);
    fireEvent.click(screen.getByRole("tab", { name: "运行治理" }));

    expect(
      await screen.findByRole("tabpanel", { name: "运行治理" }),
    ).toBeVisible();
    expect(screen.getByRole("region", { name: "运行治理总览" })).toBeVisible();
    expect(getSnapshot).toHaveBeenCalledOnce();
    expect(
      JSON.parse(
        window.localStorage.getItem("realmflow:analytics-view:v1") ?? "{}",
      ),
    ).toMatchObject({ version: 1, view: "governance" });
  });

  it("queries 30 days and presents usage, quality, speed and estimated cost", async () => {
    vi.spyOn(Date, "now").mockReturnValue(4_000_000_000);
    const { queryModelStatistics } = setup();

    render(<AnalyticsPage />);
    fireEvent.click(screen.getByRole("tab", { name: "模型调用" }));

    const overview = await screen.findByRole("region", {
      name: "模型调用总览",
    });
    expect(queryModelStatistics).toHaveBeenCalledWith({
      from: 4_000_000_000 - 30 * 24 * 60 * 60 * 1_000,
      to: 4_000_000_000,
      groupBy: "model",
    });
    expect(within(overview).getByText("3")).toBeInTheDocument();
    expect(within(overview).getByText("11,500")).toBeInTheDocument();
    expect(within(overview).getByText("8,000")).toBeInTheDocument();
    expect(within(overview).getByText("2,000")).toBeInTheDocument();
    expect(within(overview).getByText("1,000")).toBeInTheDocument();
    expect(within(overview).getByText("500")).toBeInTheDocument();
    expect(within(overview).getByText("300 ms")).toBeInTheDocument();
    expect(within(overview).getByText("42.5 tok/s")).toBeInTheDocument();
    expect(within(overview).getByText("66.7%")).toBeInTheDocument();
    expect(within(overview).getByText("US$0.0480")).toBeInTheDocument();
    expect(screen.getAllByText(/估算成本/).length).toBeGreaterThan(0);
    expect(
      screen.getByRole("region", { name: "每日趋势" }),
    ).toBeInTheDocument();
    const groupRow = screen.getByRole("row", { name: /GPT 4.1/ });
    expect(groupRow).toBeInTheDocument();
    expect(groupRow.closest("table")).toHaveClass(
      "ui-data-table",
      "ui-data-table--compact",
    );
  });

  it("queries again when entity filters and grouping change", async () => {
    const { queryModelStatistics } = setup();
    render(<AnalyticsPage />);
    fireEvent.click(screen.getByRole("tab", { name: "模型调用" }));
    await screen.findByRole("row", { name: /GPT 4.1/ });

    fireEvent.change(screen.getByLabelText("Provider"), {
      target: { value: "provider-1" },
    });
    fireEvent.change(screen.getByLabelText("分组维度"), {
      target: { value: "provider" },
    });

    expect(queryModelStatistics).toHaveBeenLastCalledWith(
      expect.objectContaining({
        providerId: "provider-1",
        groupBy: "provider",
      }),
    );
    expect(
      JSON.parse(
        window.localStorage.getItem("realmflow:model-statistics-filters:v1") ??
          "{}",
      ),
    ).toMatchObject({
      providerId: "provider-1",
      groupBy: "provider",
    });
  });

  it("localizes controls in Japanese without translating option data", async () => {
    setup();
    const storage = {
      ...window.localStorage,
      getItem: vi.fn((key: string) =>
        key === "realmflow:locale:v1"
          ? JSON.stringify({ version: 1, locale: "ja" })
          : null,
      ),
      setItem: vi.fn(),
    } as unknown as Storage;

    render(<AnalyticsPage />, storage);
    fireEvent.click(screen.getByRole("tab", { name: "モデル呼び出し" }));

    expect(
      await screen.findByRole("tabpanel", { name: "モデル呼び出し" }),
    ).toBeVisible();
    expect(screen.getByLabelText("期間")).toBeVisible();
    expect(screen.getByRole("option", { name: "GPT 4.1" })).toBeVisible();
  });

  it("keeps the latest result when an older request resolves last", async () => {
    const first = deferred<ModelStatisticsResult>();
    const second = deferred<ModelStatisticsResult>();
    const queryModelStatistics = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    setup(queryModelStatistics);
    render(<AnalyticsPage />);
    fireEvent.click(screen.getByRole("tab", { name: "模型调用" }));

    fireEvent.change(screen.getByLabelText("分组维度"), {
      target: { value: "provider" },
    });
    second.resolve(result("最新结果"));
    expect(
      await screen.findByRole("row", { name: /最新结果/ }),
    ).toBeInTheDocument();

    first.resolve(result("过期结果"));
    await Promise.resolve();
    expect(
      screen.queryByRole("row", { name: /过期结果/ }),
    ).not.toBeInTheDocument();
  });

  it("shows a retryable error without discarding the selected filters", async () => {
    const queryModelStatistics = vi
      .fn()
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValueOnce(result());
    setup(queryModelStatistics);
    window.localStorage.setItem(
      "realmflow:model-statistics-filters:v1",
      JSON.stringify({ timeRange: "90d", groupBy: "model" }),
    );
    render(<AnalyticsPage />);
    fireEvent.click(screen.getByRole("tab", { name: "模型调用" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "模型统计加载失败，请重试",
    );
    fireEvent.click(screen.getByRole("button", { name: "重试" }));

    expect(
      await screen.findByRole("row", { name: /GPT 4.1/ }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("时间范围")).toHaveValue("90d");
  });
});
