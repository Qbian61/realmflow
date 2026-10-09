import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { vi } from "vitest";
import type { WorkbenchAttachmentApi } from "../../../../shared/workbench-attachments";
import type {
  WorkbenchSite,
  WorkbenchSiteApi,
  WorkbenchSitesSnapshot,
} from "../../../../shared/workbench-sites";
import { LocalizationProvider } from "../../../localization/LocalizationProvider";
import { SiteWorkbenchPage } from "./SiteWorkbenchPage";

describe("SiteWorkbenchPage", () => {
  it("renders group counts, site cards, and first-character icon fallbacks", async () => {
    renderPage();

    const groupButton = await screen.findByRole("button", {
      name: "未分组 (1)",
    });
    expect(groupButton).toBeInTheDocument();
    expect(groupButton.closest(".workbench-navigation-item")).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "打开 RealmFlow" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "打开 RealmFlow" }).closest("article"),
    ).toHaveClass("ui-card", "ui-card--compact", "ui-card--interactive");
    expect(screen.getByText("R")).toHaveClass("workbench-site-card-fallback");
    expect(
      screen.getByRole("button", { name: "上移 RealmFlow" }),
    ).toHaveAttribute("title", "上移");
    expect(
      screen.getByRole("button", { name: "下移 RealmFlow" }),
    ).toHaveAttribute("title", "下移");
    expect(
      screen.getByRole("button", { name: "编辑 RealmFlow" }),
    ).toHaveAttribute("title", "编辑");
    expect(
      screen.getByRole("button", { name: "删除 RealmFlow" }),
    ).toHaveAttribute("title", "删除");
    expect(screen.queryByRole("button", { name: "重命名 未分组" })).toBeNull();
  });

  it("renames a group inline after double click", async () => {
    const sites = createSitesApi({
      updateGroup: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          ...createSnapshot().groups[0],
          name: "常用",
        },
      }),
    });
    renderPage({ sites });
    const group = await screen.findByRole("button", { name: "未分组 (1)" });

    fireEvent.doubleClick(group);

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("textbox", { name: "重命名 未分组" })).toHaveValue(
      "未分组",
    );
  });

  it("uses an icon-only create button in the split footer", async () => {
    renderPage();
    await screen.findByRole("button", { name: "未分组 (1)" });

    expect(screen.getByRole("button", { name: "新增分组" })).toHaveTextContent(
      /^$/,
    );
  });

  it("creates a default group directly and starts inline renaming", async () => {
    const created = {
      ...createSnapshot().groups[0],
      id: "group-2",
      name: "新建分组",
      position: 10,
      siteCount: 0,
    };
    const sites = createSitesApi({
      createGroup: vi.fn().mockResolvedValue(created),
    });
    renderPage({ sites });
    await screen.findByRole("button", { name: "未分组 (1)" });

    fireEvent.click(screen.getByRole("button", { name: "新增分组" }));

    expect(screen.queryByRole("dialog", { name: "新增分组" })).toBeNull();
    expect(
      await screen.findByRole("textbox", {
        name: "重命名 新建分组",
      }),
    ).toHaveFocus();
    expect(sites.createGroup).toHaveBeenCalledWith(
      expect.objectContaining({ name: "新建分组" }),
    );
  });

  it("allows deleting the only group and its sites", async () => {
    const snapshot = createSnapshot();
    const sites = createSitesApi({
      getSnapshot: vi
        .fn()
        .mockResolvedValueOnce(snapshot)
        .mockResolvedValueOnce({
          groups: [],
          sites: [],
        }),
      deleteGroup: vi.fn().mockResolvedValue({
        ok: true,
        value: { groupId: snapshot.groups[0].id },
      }),
    });
    renderPage({ sites });

    expect(
      await screen.findByLabelText("拖拽排序 未分组"),
    ).toBeInTheDocument();
    const remove = screen.getByRole("button", {
      name: "删除分组 未分组",
    });
    expect(remove).toHaveClass("danger");
    expect(remove).toHaveAttribute("title", "删除");
    fireEvent.click(remove);
    const dialog = screen.getByRole("dialog", { name: "删除分组" });
    expect(dialog).toHaveClass("ui-dialog", "ui-dialog--compact");
    expect(dialog).toHaveTextContent("分组中的网站将同时删除。");
    const confirm = within(dialog).getByRole("button", { name: "删除" });
    expect(confirm).toHaveClass("ui-button", "ui-button--danger");
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(sites.deleteGroup).toHaveBeenCalledWith(
        expect.objectContaining({
          groupId: "workbench-site-group-ungrouped",
          expectedRevision: 0,
        }),
      ),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "新增网站" }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "新增分组" })).toBeInTheDocument();
  });

  it("hides the create-site action when there are no groups", async () => {
    renderPage({
      sites: createSitesApi({
        getSnapshot: vi.fn().mockResolvedValue({ groups: [], sites: [] }),
      }),
    });

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "新增网站" }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "新增分组" })).toBeInTheDocument();
  });

  it("reorders groups from a hover drag handle", async () => {
    const snapshot = createSnapshot();
    snapshot.groups.push(
      {
        ...snapshot.groups[0],
        id: "group-1",
        name: "产品",
        position: 10,
        siteCount: 0,
      },
      {
...snapshot.groups[0],
        id: "group-2",
        name: "研发",
        position: 20,
        siteCount: 0,
      },
    );
    const sites = createSitesApi({
      getSnapshot: vi.fn().mockResolvedValue(snapshot),
      updateGroup: vi.fn().mockResolvedValue({
        ok: true,
        value: snapshot.groups[1],
      }),
    });
    renderPage({ sites });
    const source = await screen.findByLabelText("拖拽排序 研发");
    const target = screen
      .getByRole("button", { name: "产品 (0)" })
      .closest(".workbench-navigation-item")!;

    fireEvent.dragStart(source);
    fireEvent.dragOver(target);
    expect(target).toHaveAttribute("data-drop-target", "before");
    fireEvent.drop(target);

    await waitFor(() =>
      expect(sites.updateGroup).toHaveBeenCalledWith(
        expect.objectContaining({
          groupId: "group-2",
          expectedRevision: 0,
          position: 1,
        }),
      ),
    );
  });

  it("does not open a reorder menu when the drag handle is clicked", async () => {
    const snapshot = createSnapshot();
    snapshot.groups.push({
...snapshot.groups[0],
      id: "group-2",
      name: "产品",
      position: 10,
      siteCount: 0,
    });
    const sites = createSitesApi({
      getSnapshot: vi.fn().mockResolvedValue(snapshot),
      updateGroup: vi.fn().mockResolvedValue({
        ok: true,
        value: snapshot.groups[0],
      }),
    });
    renderPage({ sites });
    const handle = await screen.findByLabelText("拖拽排序 未分组");

    fireEvent.click(handle);

    expect(handle.tagName).toBe("SPAN");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(sites.updateGroup).not.toHaveBeenCalled();
  });

  it("adds a site only after Main confirms creation", async () => {
    let resolveCreate: ((site: WorkbenchSite) => void) | undefined;
    const sites = createSitesApi({
      createSite: vi.fn(
        () =>
          new Promise<WorkbenchSite>((resolve) => {
            resolveCreate = resolve;
          }),
      ),
    });
    renderPage({ sites });
    await screen.findByRole("button", { name: "打开 RealmFlow" });

    fireEvent.click(screen.getByRole("button", { name: "新增网站" }));
    const drawer = screen.getByRole("dialog", { name: "新增网站" });
    expect(drawer).toHaveClass("ui-dialog", "ui-drawer", "ui-drawer--default");
    expect(drawer.querySelector(".ui-drawer__body")).toBeInTheDocument();
    fireEvent.change(within(drawer).getByLabelText("名称"), {
      target: { value: "Docs" },
    });
    fireEvent.change(within(drawer).getByLabelText("URL"), {
      target: { value: "https://docs.example.com" },
    });
    fireEvent.click(within(drawer).getByRole("button", { name: "保存" }));

    expect(screen.queryByRole("button", { name: "打开 Docs" })).toBeNull();
    resolveCreate?.(site("site-2", "Docs", "https://docs.example.com/"));

    expect(
      await screen.findByRole("button", { name: "打开 Docs" }),
    ).toBeInTheDocument();
  });

  it("routes embedded sites to the web workbench and external sites to the system browser", async () => {
    const openEmbedded = vi.fn();
    const openExternal = vi.fn();
    const snapshot = createSnapshot();
    snapshot.sites.push({
      ...site("site-2", "External", "https://example.com/"),
      openMode: "external",
      position: 10,
    });
    renderPage({
      sites: createSitesApi({
        getSnapshot: vi.fn().mockResolvedValue(snapshot),
      }),
      openEmbedded,
      openExternal,
    });

    fireEvent.click(
      await screen.findByRole("button", { name: "打开 RealmFlow" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "打开 External" }));

    expect(openEmbedded).toHaveBeenCalledWith("https://realmflow.dev/");
    expect(openExternal).toHaveBeenCalledWith("https://example.com/");
  });

  it("uploads and displays a local image icon without fetching a favicon", async () => {
    const icon = {
      id: "icon-1",
      ownerType: "site_icon" as const,
      ownerId: "site-1",
      fileName: "icon.png",
      mimeType: "image/png",
      sizeBytes: 3,
      checksumSha256: "0".repeat(64),
      createdAt: 1,
    };
    const attachments = createAttachmentApi({
      pickAndAttach: vi.fn().mockResolvedValue(icon),
      readImage: vi.fn().mockResolvedValue("data:image/png;base64,cG5n"),
    });
    const sites = createSitesApi({
      updateSite: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          ...site("site-1", "RealmFlow", "https://realmflow.dev/"),
          iconAttachmentId: "icon-1",
          revision: 1,
        },
      }),
    });
    renderPage({ sites, attachments });
    await screen.findByRole("button", { name: "打开 RealmFlow" });

    fireEvent.click(screen.getByRole("button", { name: "编辑 RealmFlow" }));
    const drawer = screen.getByRole("dialog", { name: "编辑网站" });
    fireEvent.click(
      within(drawer).getByRole("button", { name: "选择本地图标" }),
    );

    const renderedIcon = await screen.findByRole("img", {
      name: "RealmFlow",
    });
    expect(renderedIcon).toHaveAttribute(
      "src",
      "data:image/png;base64,cG5n",
    );
    expect(renderedIcon).toHaveAttribute("width", "32");
    expect(renderedIcon).toHaveAttribute("height", "32");
    expect(renderedIcon).toHaveAttribute("loading", "lazy");
    expect(renderedIcon).toHaveAttribute("decoding", "async");
    expect(attachments.pickAndAttach).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerType: "site_icon",
        ownerId: "site-1",
        accept: "image",
      }),
    );

    fireEvent.error(renderedIcon);

    expect(screen.queryByRole("img", { name: "RealmFlow" })).toBeNull();
    expect(screen.getByText("R")).toHaveClass(
      "workbench-site-card-fallback",
    );
  });

  it("shows all sites without a navigation search control", async () => {
    const snapshot = createSnapshot();
    snapshot.groups[0].siteCount = 2;
    snapshot.sites.push(
      site("site-2", "产品文档", "https://docs.realmflow.dev/guide"),
    );
    const sites = createSitesApi({
      getSnapshot: vi.fn().mockResolvedValue(snapshot),
    });
    renderPage({ sites });
    await screen.findByRole("button", { name: "打开 RealmFlow" });

    expect(screen.queryByRole("searchbox", { name: "搜索网站" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "打开 产品文档" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "打开 RealmFlow" }),
    ).toBeInTheDocument();
    expect(sites.getSnapshot).toHaveBeenCalledOnce();
  });

  it("focuses the next site after a confirmed deletion", async () => {
    const snapshot = createSnapshot();
    snapshot.groups[0].siteCount = 2;
    snapshot.sites.push({
      ...site("site-2", "Docs", "https://docs.realmflow.dev/"),
      position: 10,
    });
    const sites = createSitesApi({
      getSnapshot: vi.fn().mockResolvedValue(snapshot),
      deleteSite: vi.fn().mockResolvedValue({
        ok: true,
        value: { siteId: "site-1" },
      }),
    });
    renderPage({ sites });
    await screen.findByRole("button", { name: "打开 RealmFlow" });

    fireEvent.click(screen.getByRole("button", { name: "删除 RealmFlow" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "删除网站" })).getByRole(
        "button",
        { name: "删除" },
      ),
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "打开 Docs" })).toHaveFocus(),
    );
  });
});

function renderPage({
  sites = createSitesApi(),
  attachments = createAttachmentApi(),
  openEmbedded = vi.fn(),
  openExternal = vi.fn(),
}: {
  sites?: WorkbenchSiteApi;
  attachments?: WorkbenchAttachmentApi;
  openEmbedded?: (url: string) => void | Promise<void>;
  openExternal?: (url: string) => void | Promise<void>;
} = {}): void {
  render(
    <LocalizationProvider>
      <SiteWorkbenchPage
        sitesApi={sites}
        attachmentsApi={attachments}
        openEmbedded={openEmbedded}
        openExternal={openExternal}
      />
    </LocalizationProvider>,
  );
}

function createSitesApi(
  overrides: Partial<WorkbenchSiteApi> = {},
): WorkbenchSiteApi {
  return {
    getSnapshot: vi.fn().mockResolvedValue(createSnapshot()),
    createGroup: vi.fn(),
    updateGroup: vi.fn(),
    deleteGroup: vi.fn(),
    createSite: vi.fn(),
    updateSite: vi.fn(),
    deleteSite: vi.fn(),
    ...overrides,
  };
}

function createAttachmentApi(
  overrides: Partial<WorkbenchAttachmentApi> = {},
): WorkbenchAttachmentApi {
  return {
    list: vi.fn().mockResolvedValue([]),
    pickAndAttach: vi.fn(),
    readImage: vi.fn(),
    open: vi.fn(),
    reveal: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  };
}

function createSnapshot(): WorkbenchSitesSnapshot {
  return {
    groups: [
      {
        id: "workbench-site-group-ungrouped",
        name: "未分组",
        position: 0,
        siteCount: 1,
        revision: 0,
        createdAt: 0,
        updatedAt: 0,
      },
    ],
    sites: [site("site-1", "RealmFlow", "https://realmflow.dev/")],
  };
}

function site(id: string, name: string, url: string): WorkbenchSite {
  return {
    id,
    groupId: "workbench-site-group-ungrouped",
    name,
    url,
    openMode: "embedded",
    position: 0,
    revision: 0,
    createdAt: 1,
    updatedAt: 1,
  };
}
