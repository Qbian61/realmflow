import {
  fireEvent,
  render as testingRender,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { WorkbenchHubApi } from "../../shared/workbench-hub";
import { MemoryRouter } from "react-router-dom";
import { LocalizationProvider } from "../localization/LocalizationProvider";
import WorkbenchHubPage from "./WorkbenchHubPage";

function render(ui: Parameters<typeof testingRender>[0]) {
  return testingRender(
    <MemoryRouter>
      <LocalizationProvider>{ui}</LocalizationProvider>
    </MemoryRouter>,
  );
}

describe("WorkbenchHubPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("uses the shared workspace page and toolbar primitives", () => {
    const page = render(<WorkbenchHubPage />);

    expect(page.container.firstElementChild).toHaveClass("workbench-hub-page");
    expect(page.container.firstElementChild).not.toHaveClass("ui-page");
    expect(page.container.querySelector(".workbench-hub-content")).toHaveClass(
      "ui-page__body",
      "ui-page__body--workspace",
    );
    expect(screen.getByRole("toolbar", { name: "工作台模块" })).toHaveClass(
      "ui-toolbar",
      "ui-toolbar--workspace-header",
    );
  });

  it("switches modules and lets configurable tabs be hidden and restored", () => {
    render(<WorkbenchHubPage />);

    const overviewTab = screen.getByRole("tab", { name: "工作台" });
    const tasksTab = screen.getByRole("tab", { name: "任务待办" });
    const tablist = screen.getByRole("tablist", { name: "工作台模块" });
    expect(tablist).toHaveClass("ui-tab-list", "ui-tab-list--page");
    expect(tablist.parentElement).toHaveClass("ui-tabs", "ui-tabs--page");
    overviewTab.focus();
    fireEvent.keyDown(overviewTab, { key: "ArrowRight" });
    expect(tasksTab).toHaveFocus();
    expect(overviewTab).toHaveAttribute("aria-selected", "true");

    fireEvent.click(tasksTab);
    expect(screen.getByRole("tab", { name: "任务待办" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.getByRole("tabpanel", { name: "任务待办" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "管理工作台 Tab" }));
    const dialog = screen.getByRole("dialog", { name: "管理工作台 Tab" });
    expect(dialog).toHaveClass("ui-dialog", "ui-dialog--default");
    expect(dialog.querySelector(".ui-dialog__body")).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "隐藏任务待办" }),
    );

    expect(screen.queryByRole("tab", { name: "任务待办" })).toBeNull();
    expect(screen.getByRole("tab", { name: "工作台" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    const addModule = screen.getByRole("button", {
      name: "添加工作台模块",
    });
    expect(addModule).toHaveAttribute("title", "新增");
    fireEvent.click(addModule);
    fireEvent.click(screen.getByRole("menuitem", { name: "任务待办" }));

    expect(screen.getByRole("tab", { name: "任务待办" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "任务待办" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("keeps the fixed workbench tab out of the configurable tab list", () => {
    render(<WorkbenchHubPage />);

    fireEvent.click(screen.getByRole("button", { name: "管理工作台 Tab" }));
    const dialog = screen.getByRole("dialog", { name: "管理工作台 Tab" });

    expect(
      within(dialog).queryByRole("button", { name: "隐藏工作台" }),
    ).toBeNull();
    expect(
      within(dialog).getAllByRole("button", { name: /^隐藏/ }),
    ).toHaveLength(5);
  });

  it("reorders configurable tabs from the settings dialog", () => {
    render(<WorkbenchHubPage />);

    fireEvent.click(screen.getByRole("button", { name: "管理工作台 Tab" }));
    const dialog = screen.getByRole("dialog", { name: "管理工作台 Tab" });
    const terminalHandle = within(dialog).getByLabelText("拖拽排序 终端");
    const terminalRow = terminalHandle.closest("[draggable='true']");
    const tasksRow = within(dialog)
      .getByText("任务待办")
      .closest("[draggable='true']");

    expect(terminalRow).not.toBeNull();
    expect(tasksRow).not.toBeNull();
    fireEvent.dragStart(terminalHandle);
    expect(
      within(dialog).getByText("终端").closest("[draggable='true']"),
    ).toHaveAttribute("data-dragging", "true");
    fireEvent.dragOver(
      within(dialog).getByText("任务待办").closest("[draggable='true']")!,
    );
    const currentTasksRow = within(dialog)
      .getByText("任务待办")
      .closest("[draggable='true']");
    expect(currentTasksRow).toHaveAttribute("data-drop-target", "before");
    fireEvent.drop(currentTasksRow!);

    expect(
      within(screen.getByRole("tablist", { name: "工作台模块" }))
        .getAllByRole("tab")
        .map((tab) => tab.textContent),
    ).toEqual(["工作台", "终端", "任务待办", "常用网站", "备忘录", "系统状态"]);
  });

  it("keeps configurable tab ordering drag-only", () => {
    render(<WorkbenchHubPage />);

    fireEvent.click(screen.getByRole("button", { name: "管理工作台 Tab" }));
    const dialog = screen.getByRole("dialog", { name: "管理工作台 Tab" });
    const handle = within(dialog).getByLabelText("拖拽排序 终端");

    fireEvent.click(handle);

    expect(handle.tagName).toBe("SPAN");
    expect(handle).toHaveAttribute("title", "拖拽排序");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("loads the persisted Main-owned layout", async () => {
    const layout = createLayoutApi({
      get: vi.fn().mockResolvedValue({
        revision: 4,
        moduleOrder: ["system", "terminal", "tasks", "sites", "memos"],
        hiddenModules: ["sites"],
      }),
    });

    render(<WorkbenchHubPage layoutApi={layout} />);

    await waitFor(() =>
      expect(
        within(screen.getByRole("tablist", { name: "工作台模块" }))
          .getAllByRole("tab")
          .map((tab) => tab.textContent),
      ).toEqual(["工作台", "系统状态", "终端", "任务待办", "备忘录"]),
    );
  });

  it("does not hide a tab until Main confirms the update", async () => {
    let resolveUpdate:
      | ((
          value: Awaited<ReturnType<WorkbenchHubApi["layout"]["update"]>>,
        ) => void)
      | undefined;
    const layout = createLayoutApi({
      update: vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveUpdate = resolve;
          }),
      ),
    });
    render(<WorkbenchHubPage layoutApi={layout} />);
    await waitFor(() => expect(layout.get).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "管理工作台 Tab" }));
    fireEvent.click(screen.getByRole("button", { name: "隐藏任务待办" }));

    expect(screen.getByRole("tab", { name: "任务待办" })).toBeInTheDocument();
    resolveUpdate?.({
      ok: true,
      layout: {
        revision: 1,
        moduleOrder: ["tasks", "sites", "memos", "terminal", "system"],
        hiddenModules: ["tasks"],
      },
    });

    await waitFor(() =>
      expect(screen.queryByRole("tab", { name: "任务待办" })).toBeNull(),
    );
  });

  it("keeps the current UI on failure and reloads Main state on conflict", async () => {
    const layout = createLayoutApi({
      update: vi
        .fn()
        .mockRejectedValueOnce(new Error("disk unavailable"))
        .mockResolvedValueOnce({
          ok: false,
          code: "revision_conflict",
          current: {
            revision: 3,
            moduleOrder: ["terminal", "tasks", "sites", "memos", "system"],
            hiddenModules: ["memos"],
          },
        }),
    });
    render(<WorkbenchHubPage layoutApi={layout} />);
    await waitFor(() => expect(layout.get).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "管理工作台 Tab" }));
    fireEvent.click(screen.getByRole("button", { name: "隐藏任务待办" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("保存失败"),
    );
    expect(screen.getByRole("tab", { name: "任务待办" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "隐藏常用网站" }));
    await waitFor(() =>
      expect(
        within(screen.getByRole("tablist", { name: "工作台模块" }))
          .getAllByRole("tab")
          .map((tab) => tab.textContent),
      ).toEqual(["工作台", "终端", "任务待办", "常用网站", "系统状态"]),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("布局已在其他窗口更新");
  });

  it("localizes the complete hub surface in English", () => {
    window.localStorage.setItem(
      "realmflow:locale:v1",
      JSON.stringify({ version: 1, locale: "en" }),
    );

    render(<WorkbenchHubPage />);

    expect(
      screen.getByRole("tablist", { name: "Workbench modules" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Tasks" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Manage workbench tabs" }),
    ).toBeInTheDocument();
  });
});

function createLayoutApi(
  overrides: Partial<WorkbenchHubApi["layout"]> = {},
): WorkbenchHubApi["layout"] {
  return {
    get: vi.fn().mockResolvedValue({
      revision: 0,
      moduleOrder: ["tasks", "sites", "memos", "terminal", "system"],
      hiddenModules: [],
    }),
    update: vi.fn(),
    ...overrides,
  };
}
