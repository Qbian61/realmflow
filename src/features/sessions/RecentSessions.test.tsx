import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, vi } from "vitest";
import type { ChatSession } from "../../domain/chat-session";
import type { WorkspaceSpace } from "../../domain/workspace";
import { LocalizationProvider } from "../../localization/LocalizationProvider";
import type { RecentConversationFilters } from "./recent-conversation-filters";
import { RecentSessions } from "./RecentSessions";

const spaces: WorkspaceSpace[] = [
  {
    id: "space-1",
    path: "/spaces/space-1",
    physicalPath: "/Users/example/realmflow-spaces/RealmFlow 产品",
    label: "RealmFlow 产品",
    description: "",
  },
];

const sessions: ChatSession[] = [
  {
    id: "conversation-1",
    kind: "space",
    workspaceId: "space-1",
    title: "产品讨论",
    spacePath: "/spaces/space-1",
    messages: [],
    createdAt: 1,
    updatedAt: 2,
  },
];

const defaultFilters: RecentConversationFilters = {
  kind: "all",
  workspaceId: "",
  folderPath: "",
  timeRange: "all",
};

afterEach(() => {
  vi.useRealTimers();
});

describe("RecentSessions", () => {
  it("opens a compact filter panel with type, context and time controls", () => {
    renderRecentSessions();

    expect(screen.queryByLabelText("对话类型")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "筛选最近对话" }));

    expect(screen.getByLabelText("对话类型")).toHaveValue("all");
    expect(screen.getByLabelText("对话上下文")).toHaveValue("");
    expect(screen.getByLabelText("更新时间")).toHaveValue("all");
  });

  it("reports type, workspace, folder and time filter changes", () => {
    const onFilterChange = vi.fn();
    const { rerender } = renderRecentSessions({ onFilterChange });
    fireEvent.click(screen.getByRole("button", { name: "筛选最近对话" }));

    fireEvent.change(screen.getByLabelText("对话类型"), {
      target: { value: "space" },
    });
    fireEvent.change(screen.getByLabelText("对话上下文"), {
      target: { value: "workspace:space-1" },
    });
    fireEvent.change(screen.getByLabelText("更新时间"), {
      target: { value: "week" },
    });

    expect(onFilterChange).toHaveBeenNthCalledWith(1, { kind: "space" });
    expect(onFilterChange).toHaveBeenNthCalledWith(2, {
      workspaceId: "space-1",
    });
    expect(onFilterChange).toHaveBeenNthCalledWith(3, { timeRange: "week" });

    rerender(
      <LocalizationProvider>
        <MemoryRouter>
          <RecentSessions
            sessions={sessions}
            spaces={spaces}
            folderPaths={["/work/alpha/tasks"]}
            filters={{ ...defaultFilters, kind: "general" }}
            open
            loading={false}
            onToggle={vi.fn()}
            onFilterChange={onFilterChange}
            onRename={vi.fn()}
            onDelete={vi.fn()}
          />
        </MemoryRouter>
      </LocalizationProvider>,
    );
    fireEvent.change(screen.getByLabelText("对话上下文"), {
      target: { value: "folder:/work/alpha/tasks" },
    });

    expect(onFilterChange).toHaveBeenLastCalledWith({
      folderPath: "/work/alpha/tasks",
    });
  });

  it("shows folder basenames and marks active filters", () => {
    renderRecentSessions({
      folderPaths: ["/work/alpha/tasks"],
      filters: {
        kind: "general",
        workspaceId: "",
        folderPath: "/work/alpha/tasks",
        timeRange: "all",
      },
    });
    const filterButton = screen.getByRole("button", {
      name: "筛选最近对话",
    });
    fireEvent.click(filterButton);

    expect(filterButton).toHaveClass("active");
    const folderOption = screen.getByRole("option", { name: "tasks" });
    expect(folderOption).toHaveAttribute("title", "/work/alpha/tasks");
  });

  it("distinguishes an empty filtered result from an empty recent list", () => {
    const { rerender } = renderRecentSessions({ sessions: [] });
    expect(screen.getByText("暂无对话")).toBeInTheDocument();

    rerender(
      <LocalizationProvider>
        <MemoryRouter>
          <RecentSessions
            sessions={[]}
            spaces={spaces}
            folderPaths={[]}
            filters={{ ...defaultFilters, timeRange: "day" }}
            open
            loading={false}
            onToggle={vi.fn()}
            onFilterChange={vi.fn()}
            onRename={vi.fn()}
            onDelete={vi.fn()}
          />
        </MemoryRouter>
      </LocalizationProvider>,
    );

    expect(screen.getByText("没有符合筛选的对话")).toBeInTheDocument();
  });

  it("shows the reference details in a rich hover and focus preview", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 4, 16, 0));
    const { container } = renderRecentSessions({
      sessions: [
        {
          ...sessions[0],
          kind: "general",
          folderPath: "/Users/example/realmflow/code/realmflow",
          title: "Explore Local Agent Capabilities Implementation",
          updatedAt: new Date(2026, 9, 3, 15, 42).getTime(),
        },
      ],
    });
    const shell = document.createElement("div");
    shell.className = "app-shell";
    const appContent = document.createElement("div");
    appContent.className = "app-content";
    vi.spyOn(appContent, "getBoundingClientRect").mockReturnValue({
      x: 256,
      y: 8,
      top: 8,
      right: 1272,
      bottom: 792,
      left: 256,
      width: 1016,
      height: 784,
      toJSON: () => undefined,
    });
    container.parentElement?.insertBefore(shell, container);
    shell.append(container, appContent);
    const link = screen.getByRole("link", {
      name: "Explore Local Agent Capabilities Implementation",
    });
    vi.spyOn(link, "getBoundingClientRect").mockReturnValue({
      x: 20,
      y: 100,
      top: 100,
      right: 220,
      bottom: 132,
      left: 20,
      width: 200,
      height: 32,
      toJSON: () => undefined,
    });

    expect(link).not.toHaveAttribute("title");
    fireEvent.mouseEnter(link);
    act(() => vi.advanceTimersByTime(320));

    const preview = screen.getByRole("tooltip");
    expect(preview).toHaveStyle({ left: "256px" });
    expect(
      within(preview).getByText(
        "Explore Local Agent Capabilities Implementation",
      ),
    ).toBeInTheDocument();
    expect(within(preview).getByText("本地任务")).toBeInTheDocument();
    expect(
      within(preview).getByText("/Users/example/realmflow/code/realmflow"),
    ).toBeInTheDocument();
    expect(within(preview).getByText("更新于 昨天 15:42")).toBeInTheDocument();

    fireEvent.mouseLeave(link);
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.focus(link);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

  });

  it("shows the space name and its local filesystem path in the preview", () => {
    renderRecentSessions();

    fireEvent.focus(screen.getByRole("link", { name: "产品讨论" }));

    const preview = screen.getByRole("tooltip");
    expect(
      within(preview).getByText("空间对话 · RealmFlow 产品"),
    ).toBeInTheDocument();
    expect(
      within(preview).getByText(
        "/Users/example/realmflow-spaces/RealmFlow 产品",
      ),
    ).toBeInTheDocument();
  });

  it("does not use the space display name as a local path", () => {
    renderRecentSessions({
      spaces: [{ ...spaces[0], physicalPath: undefined }],
    });

    fireEvent.focus(screen.getByRole("link", { name: "产品讨论" }));

    const preview = screen.getByRole("tooltip");
    expect(within(preview).getByText("未绑定本地目录")).toBeInTheDocument();
    expect(within(preview).queryByText("RealmFlow 产品")).toBeNull();
  });

  it("paginates recent sessions before creating link DOM", () => {
    renderRecentSessions({
      sessions: Array.from({ length: 150 }, (_, index) => ({
        ...sessions[0],
        id: `conversation-${index}`,
        title: `Conversation ${index + 1}`,
      })),
    });

    expect(screen.getAllByRole("link")).toHaveLength(100);
    expect(screen.getByText("1-100 / 150")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "下一页" }));
    expect(screen.getAllByRole("link")).toHaveLength(50);
    expect(screen.getByText("101-150 / 150")).toBeInTheDocument();
  });

  it("opens conversation actions without activating the conversation link", () => {
    const onRename = vi.fn().mockResolvedValue(undefined);
    const onDelete = vi.fn().mockResolvedValue(false);
    renderRecentSessions({ onRename, onDelete });

    fireEvent.click(
      screen.getByRole("button", { name: "产品讨论的更多操作" }),
    );

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "重命名" })).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "删除对话" }),
    ).toBeInTheDocument();
  });

  it("renames a conversation through the action dialog", async () => {
    const onRename = vi.fn().mockResolvedValue(sessions[0]);
    renderRecentSessions({ onRename });

    fireEvent.click(
      screen.getByRole("button", { name: "产品讨论的更多操作" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "重命名" }));
    fireEvent.change(screen.getByRole("textbox", { name: "新名称" }), {
      target: { value: "新标题" },
    });
    fireEvent.click(screen.getByRole("button", { name: "确认重命名" }));

    expect(onRename).toHaveBeenCalledWith("conversation-1", "新标题");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("requires confirmation before deleting a conversation", async () => {
    const onDelete = vi.fn().mockResolvedValue(true);
    renderRecentSessions({ onDelete });

    fireEvent.click(
      screen.getByRole("button", { name: "产品讨论的更多操作" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "删除对话" }));
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "产品讨论的更多操作" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "删除对话" }));
    fireEvent.click(screen.getByRole("button", { name: "确认删除对话" }));

    expect(onDelete).toHaveBeenCalledWith("conversation-1");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });
});

function renderRecentSessions(
  overrides: Partial<React.ComponentProps<typeof RecentSessions>> = {},
) {
  const props: React.ComponentProps<typeof RecentSessions> = {
    sessions,
    spaces,
    folderPaths: [],
    filters: defaultFilters,
    open: true,
    loading: false,
    onToggle: vi.fn(),
    onFilterChange: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  return render(
    <LocalizationProvider>
      <MemoryRouter>
        <RecentSessions {...props} />
      </MemoryRouter>
    </LocalizationProvider>,
  );
}
