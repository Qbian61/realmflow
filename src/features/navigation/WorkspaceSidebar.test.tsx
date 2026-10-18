import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LocalizationProvider } from "../../localization/LocalizationProvider";
import { ThemeProvider } from "../../theme/ThemeProvider";
import { DEFAULT_RECENT_CONVERSATION_FILTERS } from "../sessions/recent-conversation-filters";
import { ToastProvider } from "../toast/ToastProvider";
import { WorkspaceSidebar } from "./WorkspaceSidebar";

function renderSidebar() {
  const props: React.ComponentProps<typeof WorkspaceSidebar> = {
    visible: true,
    spaces: [
      {
        path: "/spaces/product",
        label: "产品",
        description: "",
      },
      {
        path: "/spaces/docs",
        label: "文档",
        description: "",
      },
    ],
    requirementsBySpace: {
      "/spaces/product": [
        { id: "requirement-1", title: "规划" },
        { id: "requirement-2", title: "交付" },
      ],
      "/spaces/docs": [],
    },
    recentSessions: [],
    recentFolderPaths: [],
    recentFilters: DEFAULT_RECENT_CONVERSATION_FILTERS,
    recentTotalCount: 0,
    recentSessionsHasMore: false,
    recentSessionsLoading: false,
    onRecentFilterChange: vi.fn(),
    onLoadMoreRecentSessions: vi.fn(),
    onRenameConversation: vi.fn(),
    onDeleteConversation: vi.fn(),
    onCreateSpace: vi.fn(),
    onRenameSpace: vi.fn(),
    onRelocateSpace: vi.fn(),
    onDeleteSpace: vi.fn(),
    onMoveSpace: vi.fn(),
    onCreateRequirement: vi.fn(),
    onRenameRequirement: vi.fn(),
    onDeleteRequirement: vi.fn(),
    onMoveRequirement: vi.fn(),
  };
  render(
    <MemoryRouter>
      <LocalizationProvider>
        <ToastProvider>
          <ThemeProvider>
            <WorkspaceSidebar {...props} />
          </ThemeProvider>
        </ToastProvider>
      </LocalizationProvider>
    </MemoryRouter>,
  );
  return props;
}

describe("WorkspaceSidebar drag handles", () => {
  it("keeps only new chat in the primary sidebar navigation", () => {
    renderSidebar();

    const navigation = screen.getByRole("navigation", { name: "主导航" });
    expect(
      within(navigation).getAllByRole("link").map((link) => link.textContent),
    ).toEqual(["新对话"]);
  });

  it("renders new chat as the primary sidebar button", () => {
    renderSidebar();

    const navigation = screen.getByRole("navigation", { name: "主导航" });
    const newChat = within(navigation).getByRole("link", { name: "新对话" });

    expect(navigation).toHaveClass("sidebar-primary-navigation");
    expect(newChat).toHaveClass(
      "ui-button",
      "ui-button--neutral",
      "ui-button--comfortable",
      "sidebar-new-chat",
    );
  });

  it("does not render the RealmFlow brand inside the sidebar", () => {
    renderSidebar();

    expect(
      within(screen.getByRole("complementary")).queryByText("RealmFlow"),
    ).not.toBeInTheDocument();
  });

  it("keeps schedules out of the primary sidebar navigation", () => {
    renderSidebar();

    expect(screen.queryByRole("link", { name: "定时任务" })).toBeNull();
  });

  it("drags spaces directly from their names without a drag icon", () => {
    const props = renderSidebar();
    const source = screen.getByRole("link", { name: "产品" });
    const target = screen.getByRole("link", { name: "文档" });

    expect(
      screen.queryByLabelText("拖拽排序 产品"),
    ).not.toBeInTheDocument();
    expect(source).toHaveAttribute("draggable", "true");

    fireEvent.dragStart(source);
    fireEvent.dragOver(target.closest(".space-entry")!);
    fireEvent.drop(target.closest(".space-entry")!);

    expect(props.onMoveSpace).toHaveBeenCalledWith("/spaces/product", 1);
  });

  it("places the requirements toggle before the space name", () => {
    renderSidebar();

    const spaceLink = screen.getByRole("link", { name: "产品" });
    const toggle = screen.getByRole("button", { name: "折叠 产品需求" });
    const leadingControl = toggle.closest(".space-leading-control");

    expect(leadingControl).not.toBeNull();
    expect(leadingControl?.nextElementSibling).toBe(spaceLink);
    expect(
      spaceLink.closest(".space-row")?.querySelector(".space-row-actions"),
    ).not.toContainElement(toggle);

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "规划" })).toBeNull();
  });

  it("clears a clicked requirements toggle focus when the pointer leaves the row", () => {
    renderSidebar();

    const toggle = screen.getByRole("button", { name: "折叠 产品需求" });
    const row = toggle.closest(".space-row");

    toggle.focus();
    expect(document.activeElement).toBe(toggle);

    fireEvent.mouseLeave(row!);

    expect(document.activeElement).not.toBe(toggle);
  });

  it("portals a space actions menu outside the clipped sidebar row", () => {
    renderSidebar();

    fireEvent.click(screen.getByRole("button", { name: "产品操作" }));

    const menu = screen.getByRole("menu", { name: "产品操作" });
    expect(menu.parentElement).toBe(document.body);

    fireEvent.mouseDown(
      screen.getByRole("menuitem", { name: "新建需求" }),
    );
    expect(menu).toBeInTheDocument();
  });

  it("drags requirements directly from their names without a drag icon", () => {
    const props = renderSidebar();
    const source = screen.getByRole("link", { name: "规划" });
    const target = screen.getByRole("link", { name: "交付" });

    expect(
      screen.queryByLabelText("拖拽排序 规划"),
    ).not.toBeInTheDocument();
    expect(source).toHaveAttribute("draggable", "true");

    fireEvent.dragStart(source);
    fireEvent.dragOver(target.closest("li")!);
    fireEvent.drop(target.closest("li")!);

    expect(props.onMoveRequirement).toHaveBeenCalledWith(
      "/spaces/product",
      "requirement-1",
      1,
    );
  });
});
