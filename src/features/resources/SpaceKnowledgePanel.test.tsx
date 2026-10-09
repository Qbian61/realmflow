import { fireEvent, render, screen, within } from "@testing-library/react";
import { vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { BusinessApi } from "../../../shared/business";
import type { RealmFlowApi } from "../../../shared/types";
import type { SpaceResource } from "../../domain/space-resource";
import { LocalizationProvider } from "../../localization/LocalizationProvider";
import { ToastProvider } from "../toast/ToastProvider";
import { SpaceKnowledgePanel } from "./SpaceKnowledgePanel";

vi.mock("../workbench/WorkbenchProvider", () => ({
  useWorkbench: () => ({ openWorkspaceSelection: vi.fn() }),
}));

const persistenceMessage =
  "当前更改暂时无法保存，请检查本地存储权限或可用空间。";

const documentResource: SpaceResource = {
  id: "document-1",
  name: "Design doc",
  type: "document",
  locator: "https://user:password@example.test/design",
  detail: "在线文档",
  status: "indexed",
  revision: 2,
  updatedAt: 2,
  refresh: {
    enabled: true,
    preset: "manual",
    revision: 3,
    nextDueAt: 0,
    lastCheckedAt: null,
    lastChangedAt: null,
  },
};

describe("SpaceKnowledgePanel", () => {
  it("uses shared toolbar, badge and empty state primitives", async () => {
    renderPanel(
      {
        getKnowledgeRuntimeHealth: vi.fn().mockResolvedValue({
          status: "ready",
          components: {
            vectorStore: "ready",
            embeddings: "ready",
          },
        }),
      },
      vi.fn(),
      [],
    );

    expect(screen.getByRole("toolbar", { name: "资源类型筛选" })).toHaveClass(
      "ui-toolbar",
    );
    expect(
      screen.getByRole("button", { name: "上传本地文件" }),
    ).toHaveClass(
      "ui-button",
      "ui-button--default",
      "ui-button--primary",
    );
    expect(
      await screen.findByRole("status", { name: "本地知识运行时" }),
    ).toHaveClass("ui-badge", "ui-badge--success");
    expect(
      screen.getByText("暂无匹配的空间资源").closest(".ui-empty-state"),
    ).toBeTruthy();
  });

  it("publishes a safe toast when opening a resource fails", async () => {
    const sensitiveError =
      "open https://user:password@example.test/design failed";
    renderPanel({
      getOnlineDocumentSnapshot: vi
        .fn()
        .mockRejectedValue(new Error(sensitiveError)),
    });

    fireEvent.click(screen.getByRole("button", { name: "打开 Design doc" }));

    expect(await screen.findByText(persistenceMessage)).toBeInTheDocument();
    expect(screen.queryByText(sensitiveError)).not.toBeInTheDocument();
  });

  it("publishes a localized toast when synchronizing a resource fails", async () => {
    renderPanel({
      refreshKnowledgeSource: vi
        .fn()
        .mockRejectedValue(new Error("sync /Users/alice/private failed")),
    });

    fireEvent.click(screen.getByRole("button", { name: "刷新 Design doc" }));

    expect(
      await screen.findByText("在线文档同步失败，请检查连接器和文档路径"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("sync /Users/alice/private failed"),
    ).not.toBeInTheDocument();
  });

  it("publishes a safe toast when changing the refresh policy fails", async () => {
    renderPanel({
      setKnowledgeRefreshPolicy: vi
        .fn()
        .mockRejectedValue(new Error("database at /private/data.db failed")),
    });

    fireEvent.change(
      screen.getByRole("combobox", {
        name: "Design doc 的自动刷新周期",
      }),
      { target: { value: "5m" } },
    );

    expect(await screen.findByText(persistenceMessage)).toBeInTheDocument();
    expect(
      screen.queryByText("database at /private/data.db failed"),
    ).not.toBeInTheDocument();
  });

  it("publishes a safe toast when deleting a resource fails", async () => {
    renderPanel({
      removeKnowledgeSource: vi
        .fn()
        .mockRejectedValue(new Error("delete token=secret failed")),
    });

    fireEvent.click(screen.getByRole("button", { name: "删除 Design doc" }));

    expect(await screen.findByText(persistenceMessage)).toBeInTheDocument();
    expect(
      screen.queryByText("delete token=secret failed"),
    ).not.toBeInTheDocument();
  });

  it("keeps index task failures out of transient toast notifications", async () => {
    const onPersistenceUnavailable = vi.fn();
    renderPanel(
      {
        buildKnowledgeIndex: vi
          .fn()
          .mockRejectedValue(new Error("index task failed")),
      },
      onPersistenceUnavailable,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "建立索引 Design doc" }),
    );

    await vi.waitFor(() => {
      expect(onPersistenceUnavailable).toHaveBeenCalledWith(true);
    });
    expect(screen.queryByText(persistenceMessage)).not.toBeInTheDocument();
  });

  it("paginates more than 100 knowledge resources", () => {
    renderPanel(
      {},
      vi.fn(),
      Array.from({ length: 150 }, (_, index) => ({
        ...documentResource,
        id: `document-${index}`,
        name: `Document ${index + 1}`,
      })),
    );

    expect(document.querySelectorAll(".space-resource-table [role='row']")).toHaveLength(
      101,
    );
    expect(screen.getByText("1-100 / 150")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "下一页" }));
    expect(document.querySelectorAll(".space-resource-table [role='row']")).toHaveLength(
      51,
    );
  });

  it("restores resource filters, search, and pagination from the URL", () => {
    renderPanel(
      {},
      vi.fn(),
      Array.from({ length: 150 }, (_, index) => ({
        ...documentResource,
        id: `document-${index}`,
        name: `Design document ${index + 1}`,
      })),
      "/spaces/space-1?resourceType=document&resourceQuery=design&resourcePage=2",
    );

    expect(
      within(screen.getByRole("toolbar", { name: "资源类型筛选" })).getByRole(
        "button",
        { name: /在线文档/ },
      ),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("searchbox", { name: "搜索空间资源" })).toHaveValue(
      "design",
    );
    expect(screen.getByText("101-150 / 150")).toBeInTheDocument();
  });
});

function renderPanel(
  overrides: Partial<BusinessApi>,
  onPersistenceUnavailable = vi.fn(),
  resources: SpaceResource[] = [documentResource],
  initialEntry = "/spaces/space-1",
): void {
  const business = {
    ...overrides,
  } as unknown as BusinessApi;

  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <LocalizationProvider>
        <ToastProvider>
          <SpaceKnowledgePanel
            spaceId="space-1"
            api={{} as RealmFlowApi}
            business={business}
            resources={resources}
            setResources={vi.fn()}
            onPersistenceUnavailable={onPersistenceUnavailable}
          />
        </ToastProvider>
      </LocalizationProvider>
    </MemoryRouter>,
  );
}
