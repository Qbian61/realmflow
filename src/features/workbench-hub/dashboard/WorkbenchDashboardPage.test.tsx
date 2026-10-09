import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { DashboardSnapshotDto } from "../../../../shared/workbench-dashboard";
import type { WorkbenchHubApi } from "../../../../shared/workbench-hub";
import { LocalizationProvider } from "../../../localization/LocalizationProvider";
import { WorkbenchDashboardPage } from "./WorkbenchDashboardPage";

describe("WorkbenchDashboardPage", () => {
  it("renders controls, metrics, progress, activity, and exceptions", async () => {
    const api = createApi();
    renderDashboard(api);

    expect(
      await screen.findByRole("region", { name: "工作台概览" }),
    ).toBeInTheDocument();
    expect(screen.getByText("进行中的需求")).toBeInTheDocument();
    expect(screen.getByText("完成 1 / 执行 3")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "空间进展" })).toBeInTheDocument();
    expect(screen.getByText("Failed node")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "从工作台新建对话" }),
    ).toHaveAttribute("href", "/chat/new");
  });

  it("filters exceptions and refreshes when the workspace changes", async () => {
    const api = createApi();
    renderDashboard(api);
    await screen.findByText("Choose target");

    fireEvent.click(screen.getByRole("tab", { name: "系统异常" }));
    const exceptions = screen.getByRole("region", { name: "异常中心" });
    expect(within(exceptions).queryByText("Choose target")).toBeNull();
    expect(within(exceptions).getByText("Build")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "空间筛选" }), {
      target: { value: "space-b" },
    });
    await waitFor(() =>
      expect(api.getSnapshot).toHaveBeenLastCalledWith({
        workspaceId: "space-b",
        rangeHours: 168,
      }),
    );
  });

  it("restores workspace, range, and exception filters from the URL", async () => {
    const api = createApi();
    renderDashboard(
      api,
      "/workbench/dashboard?workspace=space-b&range=24&exceptions=system",
    );

    await waitFor(() =>
      expect(api.getSnapshot).toHaveBeenCalledWith({
        workspaceId: "space-b",
        rangeHours: 24,
      }),
    );
    expect(screen.getByRole("combobox", { name: "空间筛选" })).toHaveValue(
      "space-b",
    );
    expect(screen.getByRole("combobox", { name: "时间范围" })).toHaveValue(
      "24",
    );
    expect(screen.getByRole("tab", { name: "系统异常" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("renders load failures as a shared inline alert with retry", async () => {
    const api = createApi();
    vi.mocked(api.getSnapshot).mockRejectedValue(new Error("offline"));
    renderDashboard(api);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveClass("ui-inline-alert", "ui-inline-alert--danger");

    fireEvent.click(
      within(alert).getByRole("button", { name: "重试" }),
    );
    await waitFor(() => expect(api.getSnapshot).toHaveBeenCalledTimes(2));
  });
});

function renderDashboard(
  api: WorkbenchHubApi["dashboard"],
  initialEntry = "/workbench/dashboard",
) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <LocalizationProvider>
        <WorkbenchDashboardPage api={api} />
      </LocalizationProvider>
    </MemoryRouter>,
  );
}

function createApi(): WorkbenchHubApi["dashboard"] {
  return {
    getSnapshot: vi.fn().mockResolvedValue(snapshot()),
    onInvalidated: vi.fn().mockReturnValue(() => undefined),
  };
}

function snapshot(): DashboardSnapshotDto {
  return {
    asOf: 2_000,
    scope: { rangeStart: 1_000, rangeEnd: 2_000 },
    summary: {
      activeRequirements: 2,
      waitingForUser: 1,
      runtimeExceptions: 1,
      completionRate: 1 / 3,
      completedCount: 1,
      enteredExecutionCount: 3,
    },
    spaces: [
      {
        id: "space-b",
        label: "Beta",
        health: "failed",
        activeRequirements: 1,
        waitingForUser: 0,
        runtimeExceptions: 1,
        completedRequirements: 1,
        totalRequirements: 2,
        updatedAt: 1_900,
      },
      {
        id: "space-a",
        label: "Alpha",
        health: "waiting_user",
        activeRequirements: 1,
        waitingForUser: 1,
        runtimeExceptions: 0,
        completedRequirements: 2,
        totalRequirements: 4,
        updatedAt: 1_800,
      },
    ],
    inProgress: [
      {
        id: "requirement-4",
        title: "Failed node",
        workspaceId: "space-b",
        workspaceLabel: "Beta",
        executionId: "execution-4",
        executionStatus: "running",
        currentNodeId: "node-4",
        currentNodeName: "Build",
        health: "failed",
        updatedAt: 1_700,
      },
    ],
    exceptions: [
      {
        id: "question-2",
        kind: "user",
        impact: "node",
        blocksSuccessors: true,
        waitingSince: 1_350,
        occurredAt: 1_350,
        workspaceId: "space-a",
        workspaceLabel: "Alpha",
        requirementId: "requirement-2",
        requirementTitle: "Needs answer",
        nodeRunId: "run-2",
        nodeId: "node-2",
        title: "Choose target",
      },
      {
        id: "run-4",
        kind: "system",
        impact: "node",
        blocksSuccessors: true,
        waitingSince: 1_700,
        occurredAt: 1_700,
        workspaceId: "space-b",
        workspaceLabel: "Beta",
        requirementId: "requirement-4",
        requirementTitle: "Failed node",
        nodeRunId: "run-4",
        nodeId: "node-4",
        title: "Build",
      },
    ],
    recentResults: [
      {
        id: "execution-1",
        workspaceId: "space-a",
        workspaceLabel: "Alpha",
        requirementId: "requirement-1",
        requirementTitle: "Delivered",
        executionId: "execution-1",
        outcome: "completed",
        completedAt: 1_400,
      },
    ],
  };
}
