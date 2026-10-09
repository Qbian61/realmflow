import { fireEvent, render, screen } from "@testing-library/react";
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
    recentSessionsLoading: false,
    onRecentFilterChange: vi.fn(),
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
  it("keeps space ordering drag-only", () => {
    const props = renderSidebar();
    const handle = screen.getByLabelText("拖拽排序 产品");

    fireEvent.click(handle);

    expect(handle.tagName).toBe("SPAN");
    expect(handle).toHaveAttribute("title", "拖拽排序");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(props.onMoveSpace).not.toHaveBeenCalled();
  });

  it("keeps requirement ordering drag-only", () => {
    const props = renderSidebar();
    const handle = screen.getByLabelText("拖拽排序 规划");

    fireEvent.click(handle);

    expect(handle.tagName).toBe("SPAN");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(props.onMoveRequirement).not.toHaveBeenCalled();
  });
});
