import {
  act,
  fireEvent,
  render as testingRender,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { vi } from "vitest";
import type { RealmFlowApi } from "../../../shared/types";
import { LocalizationProvider } from "../../localization/LocalizationProvider";
import { WorkbenchProvider, useWorkbench } from "./WorkbenchProvider";

function render(
  ui: Parameters<typeof testingRender>[0],
): ReturnType<typeof testingRender> {
  return testingRender(<LocalizationProvider>{ui}</LocalizationProvider>);
}

vi.mock("../artifacts/ArtifactWorkbench", () => ({
  default: ({
    initialPath,
  }: {
    initialPath?: string;
  }) => (
    <textarea
      aria-label="工作区编辑内容"
      data-initial-path={initialPath}
      defaultValue=""
    />
  ),
}));

vi.mock("./TerminalPane", () => ({
  default: ({ title }: { title: string }) => (
    <div aria-label={title}>Terminal</div>
  ),
}));

vi.mock("./CodeSnippetPane", () => ({
  default: ({ snippet }: { snippet: { content: string } }) => (
    <textarea aria-label="代码工作区内容" defaultValue={snippet.content} />
  ),
}));

function TestPage(): JSX.Element {
  const navigate = useNavigate();
  const workbench = useWorkbench();
  return (
    <main>
      <button type="button" onClick={() => void workbench.openFiles()}>
        打开测试文件
      </button>
      <button type="button" onClick={() => void workbench.openFolder()}>
        打开测试文件夹
      </button>
      <button
        type="button"
        onClick={() => void workbench.openUrl("example.com")}
      >
        打开测试网页
      </button>
      <button type="button" onClick={() => void workbench.openUrl()}>
        请求打开网页
      </button>
      <button
        type="button"
        onClick={() =>
          workbench.openCodeSnippet({
            language: "javascript",
            content: 'console.log("ready")',
            suggestedName: "snippet.js",
          })
        }
      >
        打开测试代码
      </button>
      <button
        type="button"
        onClick={() =>
          workbench.openRequirementArtifact(
            "requirement-1",
            "artifacts/reviews/final.md",
            "final.md",
          )
        }
      >
        打开精确产物
      </button>
      <a href="https://realmflow.example/docs">网页产物</a>
      <a href="#/next">应用菜单</a>
      <button type="button" onClick={() => navigate("/next")}>
        切换页面
      </button>
    </main>
  );
}

function createApi(): RealmFlowApi {
  return {
    platform: "darwin",
    getSidecarStatus: vi.fn().mockResolvedValue("ready"),
    quitApp: vi.fn().mockResolvedValue(undefined),
    workbenchHub: {
      layout: {
        get: vi.fn(),
        update: vi.fn(),
      },
      dashboard: {
        getSnapshot: vi.fn(),
        onInvalidated: vi.fn().mockReturnValue(() => undefined),
      },
      attachments: {} as never,
      memos: {} as never,
      sites: {} as never,
      tasks: {} as never,
      system: {
        getStatus: vi.fn(),
      },
    },
    aiRuns: {
      start: vi.fn(),
      cancel: vi.fn(),
      get: vi.fn(),
      attach: vi.fn(),
      listEvents: vi.fn(),
      recover: vi.fn(),
      onEvent: vi.fn().mockReturnValue(() => undefined),
    },
    business: {} as never,
    toolCatalog: {} as never,
    toolPermissions: {} as never,
    persistence: {
      load: vi.fn().mockResolvedValue({
        status: "loaded",
        snapshot: { revision: 0, value: null },
      }),
      onChanged: vi.fn().mockReturnValue(() => undefined),
    },
    workspace: {
      chooseFiles: vi.fn().mockResolvedValue({
        binding: {
          requirementId: "session-files",
          rootName: "selected",
          rootPath: "/tmp/selected",
        },
        files: [
          {
            name: "notes.md",
            path: "notes.md",
            content: "# Notes",
            kind: "markdown",
            language: "markdown",
            size: 7,
            modifiedAt: 1,
            version: "1:7",
          },
        ],
      }),
      openSessionFiles: vi.fn().mockResolvedValue({
        binding: {
          requirementId: "session-files",
          rootName: "selected",
          rootPath: "/tmp/selected",
        },
        files: [],
      }),
      chooseFolder: vi.fn().mockResolvedValue({
        requirementId: "session-folder",
        rootName: "project",
        rootPath: "/tmp/project",
      }),
      chooseDirectory: vi.fn().mockResolvedValue(null),
      getBinding: vi.fn().mockResolvedValue(null),
      listDirectory: vi.fn().mockResolvedValue([]),
      readFile: vi.fn(),
      writeFile: vi.fn(),
      readManifest: vi.fn().mockResolvedValue({
        version: 1,
        requirementId: "session-files",
        stages: {},
      }),
      writeManifest: vi.fn(),
      getPreviewUrl: vi.fn(),
      showItem: vi.fn(),
    },
    webWorkbench: {
      create: vi.fn().mockResolvedValue({
        id: "web-1",
        title: "Example",
        url: "https://example.com/",
        loading: false,
        canGoBack: false,
        canGoForward: false,
      }),
      show: vi.fn().mockResolvedValue(undefined),
      hideAll: vi.fn().mockResolvedValue(undefined),
      setBounds: vi.fn().mockResolvedValue(undefined),
      navigate: vi.fn(),
      goBack: vi.fn(),
      goForward: vi.fn(),
      reload: vi.fn(),
      destroy: vi.fn(),
      openExternal: vi.fn(),
      onStateChange: vi.fn().mockReturnValue(() => undefined),
      onAgentBrowserSurface: vi.fn().mockReturnValue(() => undefined),
    },
    terminal: {
      create: vi.fn().mockResolvedValue({
        id: "terminal-1",
        title: "终端 · project",
        cwd: "/tmp/project",
      }),
      createHome: vi.fn().mockResolvedValue({
        id: "terminal-home",
        title: "tester",
        cwd: "/Users/tester",
        shell: "zsh",
      }),
      write: vi.fn().mockResolvedValue(undefined),
      resize: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn().mockResolvedValue(undefined),
      onEvent: vi.fn().mockReturnValue(() => undefined),
    },
  };
}

function addNativeOverlayApi(api: RealmFlowApi) {
  const nativeOverlay = {
    show: vi.fn().mockResolvedValue(undefined),
    hide: vi.fn().mockResolvedValue(undefined),
    onEvent: vi.fn().mockReturnValue(() => undefined),
  };
  return {
    api: Object.assign(api, { nativeOverlay }),
    nativeOverlay,
  };
}

describe("WorkbenchProvider", () => {
  it("keeps the page-edge toggle visible and opens an empty global dock", async () => {
    const api = createApi();
    render(
      <MemoryRouter initialEntries={["/"]}>
        <WorkbenchProvider api={api}>
          <Routes>
            <Route path="/" element={<TestPage />} />
          </Routes>
        </WorkbenchProvider>
      </MemoryRouter>,
    );

    expect(
      screen.queryByRole("complementary", { name: "全局工作区" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "打开文件" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "打开文件夹" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "打开网页" }),
    ).not.toBeInTheDocument();

    const openButton = screen.getByRole("button", { name: "打开工作区" });
    expect(openButton.closest(".global-workbench-page")).not.toBeNull();
    expect(openButton.querySelector("svg")).toHaveAttribute("width", "18");
    expect(openButton.querySelector("svg")).toHaveAttribute(
      "stroke-width",
      "1.8",
    );
    fireEvent.click(openButton);

    expect(
      screen.getByRole("complementary", { name: "全局工作区" }),
    ).toBeInTheDocument();
    expect(screen.getByText("从这里开始")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "文件 浏览和预览文件" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "文件夹 浏览文件夹目录" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "浏览器 浏览及调试网页" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "终端 运行命令及脚本" }),
    ).toBeInTheDocument();

    const closeButton = screen.getByRole("button", { name: "收起工作区" });
    expect(closeButton.closest(".global-workbench-page")).not.toBeNull();
    expect(closeButton.closest(".global-workbench-header")).toBeNull();
    expect(closeButton.querySelector("svg")).toHaveAttribute("width", "18");
    expect(closeButton.querySelector("svg")).toHaveAttribute(
      "stroke-width",
      "1.8",
    );
    fireEvent.click(closeButton);

    expect(
      screen.queryByRole("complementary", { name: "全局工作区" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "打开测试文件" }));

    expect(
      await screen.findByRole("complementary", { name: "全局工作区" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "selected" })).toBeInTheDocument();
  });

  it("keeps the middle and right workspaces above their minimum widths while resizing", () => {
    const api = createApi();
    const { container } = render(
      <MemoryRouter initialEntries={["/"]}>
        <WorkbenchProvider api={api}>
          <div className="app-shell">
            <aside className="sidebar" />
            <main
              className="app-content"
              style={{ marginLeft: 8, marginRight: 0 }}
            />
          </div>
        </WorkbenchProvider>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "打开工作区" }));

    const layout = container.querySelector(
      ".global-workbench-layout",
    ) as HTMLDivElement;
    vi.spyOn(layout, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      width: 1200,
      height: 800,
      top: 0,
      right: 1200,
      bottom: 800,
      left: 0,
      toJSON: () => ({}),
    });
    const sidebar = container.querySelector(".sidebar") as HTMLElement;
    vi.spyOn(sidebar, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      width: 248,
      height: 800,
      top: 0,
      right: 248,
      bottom: 800,
      left: 0,
      toJSON: () => ({}),
    });

    const resizer = screen.getByRole("separator", {
      name: "调整全局工作区宽度",
    });
    fireEvent.mouseDown(resizer, { clientX: 560 });
    fireEvent.mouseMove(window, { clientX: 0 });
    expect(layout).toHaveStyle({ "--global-workbench-width": "620px" });

    fireEvent.mouseMove(window, { clientX: 1000 });
    expect(layout).toHaveStyle({ "--global-workbench-width": "448px" });
    fireEvent.mouseUp(window);
  });

  it("opens folders and web pages as reusable tabs", async () => {
    const api = createApi();
    render(
      <MemoryRouter initialEntries={["/"]}>
        <WorkbenchProvider api={api}>
          <Routes>
            <Route path="/" element={<TestPage />} />
          </Routes>
        </WorkbenchProvider>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "打开测试文件夹" }));
    expect(
      await screen.findByRole("tab", { name: "project" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "打开测试网页" }));
    expect(
      await screen.findByRole("tab", { name: "Example" }),
    ).toBeInTheDocument();
    expect(api.webWorkbench.create).toHaveBeenCalledWith("example.com");
  });

  it("opens a conversation code block in a reusable code tab", async () => {
    const api = createApi();
    render(
      <MemoryRouter>
        <WorkbenchProvider api={api}>
          <TestPage />
        </WorkbenchProvider>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "打开测试代码" }));
    expect(
      await screen.findByRole("tab", { name: "snippet.js" }),
    ).toBeInTheDocument();
    expect(await screen.findByLabelText("代码工作区内容")).toHaveValue(
      'console.log("ready")',
    );

    fireEvent.click(screen.getByRole("button", { name: "打开测试代码" }));
    expect(screen.getAllByRole("tab", { name: "snippet.js" })).toHaveLength(1);
  });

  it("opens a requirement artifact at its exact relative path", async () => {
    render(
      <MemoryRouter>
        <WorkbenchProvider api={createApi()}>
          <TestPage />
        </WorkbenchProvider>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "打开精确产物" }));

    expect(await screen.findByLabelText("工作区编辑内容")).toHaveAttribute(
      "data-initial-path",
      "artifacts/reviews/final.md",
    );
  });

  it("keeps the add button fixed after the scrollable tab list", async () => {
    const api = createApi();
    const { container } = render(
      <MemoryRouter>
        <WorkbenchProvider api={api}>
          <TestPage />
        </WorkbenchProvider>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "打开测试文件夹" }));
    await screen.findByRole("tab", { name: "project" });

    const tabList = screen.getByRole("tablist");
    const addButton = screen.getByRole("button", { name: "添加工作区内容" });
    const tabBar = tabList.closest(".global-workbench-tabbar");
    const maximizeButton = screen.getByRole("button", {
      name: "最大化工作区",
    });

    expect(tabBar).not.toBeNull();
    expect(tabBar?.closest(".global-workbench-header")).not.toBeNull();
    expect(
      container.querySelector(".global-workbench-header .ui-document-tabs"),
    ).not.toBeNull();
    expect(addButton.closest(".global-workbench-tabbar")).toBe(tabBar);
    expect(addButton.closest('[role="tablist"]')).toBeNull();
    expect(addButton.closest(".ui-toolbar")).not.toBeNull();
    expect(maximizeButton.closest(".global-workbench-header")).not.toBeNull();
    expect(maximizeButton.closest(".ui-toolbar")).not.toBeNull();
  });

  it("uses shared keyboard navigation without changing the active tab until activation", async () => {
    const api = createApi();
    render(
      <MemoryRouter>
        <WorkbenchProvider api={api}>
          <TestPage />
        </WorkbenchProvider>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "打开测试文件夹" }));
    const projectTab = await screen.findByRole("tab", { name: "project" });
    fireEvent.click(screen.getByRole("button", { name: "打开测试网页" }));
    const webTab = await screen.findByRole("tab", { name: "Example" });

    expect(webTab).toHaveAttribute("aria-selected", "true");
    webTab.focus();
    fireEvent.keyDown(webTab, { key: "Home" });
    expect(projectTab).toHaveFocus();
    expect(webTab).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(projectTab, { key: "End" });
    expect(webTab).toHaveFocus();
    fireEvent.keyDown(webTab, { key: "ArrowLeft" });
    expect(projectTab).toHaveFocus();
    fireEvent.keyDown(projectTab, { key: "Enter" });
    expect(projectTab).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("button", { name: "关闭 Example" }));
    await waitFor(() => {
      expect(screen.queryByRole("tab", { name: "Example" })).toBeNull();
    });
    expect(projectTab).toHaveAttribute("aria-selected", "true");
  });

  it("opens the native workbench menu from the plus button", async () => {
    const { api, nativeOverlay } = addNativeOverlayApi(createApi());
    render(
      <MemoryRouter>
        <WorkbenchProvider api={api}>
          <TestPage />
        </WorkbenchProvider>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "打开工作区" }));
    const addButton = screen.getByRole("button", {
      name: "添加工作区内容",
    });
    vi.spyOn(addButton, "getBoundingClientRect").mockReturnValue({
      x: 651,
      y: 16,
      width: 34,
      height: 34,
      top: 16,
      right: 685,
      bottom: 50,
      left: 651,
      toJSON: () => ({}),
    });
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(nativeOverlay.show).toHaveBeenCalledWith({
        kind: "workbench-menu",
        anchor: {
          x: 651,
          y: 16,
          width: 34,
          height: 34,
        },
      });
    });
    expect(
      screen.queryByRole("menu", { name: "添加工作区内容" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the native web view visible while the plus menu is open", async () => {
    const { api, nativeOverlay } = addNativeOverlayApi(createApi());
    render(
      <MemoryRouter>
        <WorkbenchProvider api={api}>
          <TestPage />
        </WorkbenchProvider>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "打开测试网页" }));
    await screen.findByRole("tab", { name: "Example" });
    await waitFor(() => {
      expect(api.webWorkbench.show).toHaveBeenCalled();
    });
    vi.mocked(api.webWorkbench.hideAll).mockClear();
    vi.mocked(api.webWorkbench.show).mockClear();

    const addButton = screen.getByRole("button", {
      name: "添加工作区内容",
    });
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(nativeOverlay.show).toHaveBeenCalledTimes(1);
    });
    expect(api.webWorkbench.hideAll).not.toHaveBeenCalled();
  });

  it("opens a read-only Agent browser tab from Main and removes it on close", async () => {
    const api = createApi();
    let listener:
      | ((event: import("../../../shared/workbench").AgentBrowserSurfaceEvent) => void)
      | undefined;
    vi.mocked(api.webWorkbench.onAgentBrowserSurface).mockImplementation(
      (next) => {
        listener = next;
        return () => undefined;
      },
    );
    render(
      <MemoryRouter>
        <WorkbenchProvider api={api}>
          <TestPage />
        </WorkbenchProvider>
      </MemoryRouter>,
    );

    act(() => {
      listener?.({
        type: "opened",
        page: {
          id: "browser-agent-1",
          title: "Agent Browser",
          url: "https://example.com/",
          loading: false,
          canGoBack: true,
          canGoForward: true,
          managed: "agent",
        },
      });
    });

    expect(screen.getByRole("tab", { name: "Agent Browser" })).toBeVisible();
    expect(
      screen.getByRole("complementary", { name: "全局工作区" }),
    ).toBeVisible();
    expect(screen.getByRole("textbox", { name: "网页地址" })).toHaveAttribute(
      "readonly",
    );
    expect(screen.getByRole("button", { name: "后退" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "在系统浏览器打开" }),
    ).toBeDisabled();

    act(() => {
      listener?.({ type: "closed", sessionId: "browser-agent-1" });
    });
    expect(
      screen.queryByRole("tab", { name: "Agent Browser" }),
    ).not.toBeInTheDocument();
  });

  it("opens the native workbench action menu with Cmd+P", async () => {
    const { api, nativeOverlay } = addNativeOverlayApi(createApi());
    render(
      <MemoryRouter>
        <WorkbenchProvider api={api}>
          <TestPage />
        </WorkbenchProvider>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "打开工作区" }));
    fireEvent.keyDown(window, { key: "p", metaKey: true });

    await waitFor(() => {
      expect(nativeOverlay.show).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "workbench-menu" }),
      );
    });
  });

  it("opens an interactive terminal in a newly authorized folder", async () => {
    const api = createApi();
    render(
      <MemoryRouter>
        <WorkbenchProvider api={api}>
          <TestPage />
        </WorkbenchProvider>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "打开工作区" }));
    fireEvent.click(
      screen.getByRole("button", { name: "终端 运行命令及脚本" }),
    );

    await waitFor(() => {
      expect(api.workspace.chooseFolder).toHaveBeenCalledTimes(1);
      expect(api.terminal.create).toHaveBeenCalledWith("session-folder", {
        cols: 80,
        rows: 24,
      });
    });
    expect(
      screen.getByRole("tab", { name: "终端 · project" }),
    ).toBeInTheDocument();
    expect(await screen.findByLabelText("终端 · project")).toBeInTheDocument();
  });

  it("maximizes and restores the workbench panel", () => {
    const api = createApi();
    render(
      <MemoryRouter>
        <WorkbenchProvider api={api}>
          <TestPage />
        </WorkbenchProvider>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "打开工作区" }));
    const panel = screen.getByRole("complementary", { name: "全局工作区" });
    fireEvent.click(screen.getByRole("button", { name: "最大化工作区" }));
    expect(panel.closest(".global-workbench-layout")).toHaveClass("maximized");

    fireEvent.click(screen.getByRole("button", { name: "还原工作区" }));
    expect(panel.closest(".global-workbench-layout")).not.toHaveClass(
      "maximized",
    );
  });

  it("opens page web links inside the global workbench", async () => {
    const api = createApi();
    render(
      <MemoryRouter>
        <WorkbenchProvider api={api}>
          <TestPage />
        </WorkbenchProvider>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("link", { name: "网页产物" }));

    await waitFor(() => {
      expect(api.webWorkbench.create).toHaveBeenCalledWith(
        "https://realmflow.example/docs",
      );
    });
    expect(screen.getByRole("tab", { name: "Example" })).toBeInTheDocument();
  });

  it("does not intercept application hash routes", () => {
    const api = createApi();
    render(
      <MemoryRouter>
        <WorkbenchProvider api={api}>
          <TestPage />
        </WorkbenchProvider>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("link", { name: "应用菜单" }));

    expect(api.webWorkbench.create).not.toHaveBeenCalled();
  });

  it("collects a web address in an application dialog", async () => {
    const api = createApi();
    render(
      <MemoryRouter>
        <WorkbenchProvider api={api}>
          <TestPage />
        </WorkbenchProvider>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "请求打开网页" }));
    const dialog = screen.getByRole("dialog", { name: "打开网页" });
    expect(dialog).toHaveClass("ui-dialog", "ui-dialog--compact");
    expect(dialog.querySelector(".ui-field")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开" })).toHaveClass(
      "ui-button",
      "ui-button--primary",
    );
    fireEvent.change(screen.getByRole("textbox", { name: "网页地址" }), {
      target: { value: "https://example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "打开" }));

    await waitFor(() => {
      expect(api.webWorkbench.create).toHaveBeenCalledWith(
        "https://example.com",
      );
    });
    expect(dialog).not.toBeInTheDocument();
  });

  it("keeps the workbench open with its tabs and edited content after route navigation", async () => {
    const api = createApi();
    render(
      <MemoryRouter initialEntries={["/"]}>
        <WorkbenchProvider api={api}>
          <Routes>
            <Route path="/" element={<TestPage />} />
            <Route path="/next" element={<TestPage />} />
          </Routes>
        </WorkbenchProvider>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "打开测试文件" }));
    await screen.findByRole("tab", { name: "selected" });
    fireEvent.change(screen.getByRole("textbox", { name: "工作区编辑内容" }), {
      target: { value: "未保存内容" },
    });
    vi.mocked(api.webWorkbench.hideAll).mockClear();
    fireEvent.click(screen.getByRole("button", { name: "切换页面" }));

    await waitFor(() => {
      expect(
        screen.getByRole("complementary", { name: "全局工作区" }),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole("tab", { name: "selected" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "工作区编辑内容" })).toHaveValue(
      "未保存内容",
    );
    expect(api.webWorkbench.hideAll).not.toHaveBeenCalled();
  });
});
