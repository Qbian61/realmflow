import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { WorkbenchAttachmentApi } from "../../../../shared/workbench-attachments";
import type {
  WorkbenchTaskApi,
  WorkbenchTaskRecord,
  WorkbenchTaskTableSnapshot,
} from "../../../../shared/workbench-tasks";
import { LocalizationProvider } from "../../../localization/LocalizationProvider";
import { TaskWorkbenchPage } from "./TaskWorkbenchPage";

describe("TaskWorkbenchPage", () => {
  it("renders table navigation, field types, and a sticky task grid", async () => {
    const api = createApi();
    renderPage(api);

    expect(
      await screen.findByRole("button", { name: "发布计划" }),
    ).not.toHaveTextContent("1");
    const table = await screen.findByRole("table", { name: "发布计划" });
    expect(table).toHaveClass("ui-data-table", "ui-data-table--compact");
    expect(table.parentElement).toHaveClass(
      "ui-data-table-scroll",
      "workbench-task-grid-scroll",
    );
    expect(
      within(table).getByRole("columnheader", { name: "标题" }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole("columnheader", { name: "状态" }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole("button", { name: "发布桌面版" }),
    ).toBeInTheDocument();
    expect(within(table).getByText("完成")).toBeInTheDocument();
    expect(table.querySelector("thead")).toHaveClass(
      "workbench-task-table-head",
    );
  });

  it("resizes a field column from its header separator", async () => {
    renderPage(createApi());
    const table = await screen.findByRole("table", { name: "发布计划" });
    const separator = within(table).getByRole("separator", {
      name: "调整标题列宽",
    });
    separator.setPointerCapture = vi.fn();
    const pointerDown = new MouseEvent("pointerdown", {
      bubbles: true,
      clientX: 180,
    });
    Object.defineProperty(pointerDown, "pointerId", { value: 1 });
    fireEvent(separator, pointerDown);
    const pointerMove = new MouseEvent("pointermove", {
      bubbles: true,
      clientX: 240,
    });
    Object.defineProperty(pointerMove, "pointerId", { value: 1 });
    fireEvent(separator, pointerMove);

    expect(table.querySelector("col[data-field-id='title']")).toHaveStyle({
      width: "240px",
    });
    expect(table.querySelector("col[data-field-id='status']")).toHaveStyle({
      width: "180px",
    });
    expect(table).toHaveStyle({ width: "max(100%, 464px)" });
    expect(
      table.querySelector("col.workbench-task-open-column"),
    ).not.toBeInTheDocument();
    expect(
      table.querySelector("col.workbench-task-fill-column"),
    ).toBeInTheDocument();
  });

  it("moves a row from its hover drag handle after Main confirms", async () => {
    const initial = taskSnapshot([
      record("record-1", "发布桌面版", "done"),
      record("record-2", "准备发布说明", "todo"),
    ]);
    const reordered = taskSnapshot([
      { ...record("record-2", "准备发布说明", "todo"), position: 0 },
      { ...record("record-1", "发布桌面版", "done", 1), position: 10 },
    ]);
    const api = createApi({
      listTables: vi.fn().mockResolvedValue([initial.table]),
      getTable: vi
        .fn()
        .mockResolvedValueOnce(initial)
        .mockResolvedValueOnce(reordered),
      updateRecord: vi.fn().mockResolvedValue({
        ok: true,
        value: reordered.records[1],
      }),
    });
    renderPage(api);
    const firstHandle = await screen.findByLabelText("拖拽排序 发布桌面版");
    const secondRow = screen
      .getByRole("checkbox", { name: "选择准备发布说明" })
      .closest("tr");

    fireEvent.dragStart(firstHandle);
    fireEvent.dragOver(secondRow!);
    expect(secondRow).toHaveAttribute("data-drop-target", "before");
    fireEvent.drop(secondRow!);

    await waitFor(() =>
      expect(api.updateRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          tableId: "table-1",
          recordId: "record-1",
          expectedRevision: 0,
          position: 1,
        }),
      ),
    );
    await waitFor(() =>
      expect(
        within(screen.getByRole("table", { name: "发布计划" }))
          .getAllByRole("button")
          .filter((button) =>
            ["发布桌面版", "准备发布说明"].includes(
              button.getAttribute("aria-label") ?? "",
            ),
          )
          .map((button) => button.getAttribute("aria-label")),
      ).toEqual(["准备发布说明", "发布桌面版"]),
    );
  });

  it("does not add a record until Main confirms creation", async () => {
    let resolveCreate: ((record: WorkbenchTaskRecord) => void) | undefined;
    const api = createApi({
      createRecord: vi.fn(
        () =>
          new Promise<WorkbenchTaskRecord>((resolve) => {
            resolveCreate = resolve;
          }),
      ),
    });
    renderPage(api);
    await screen.findByRole("table", { name: "发布计划" });

    fireEvent.click(screen.getByRole("button", { name: "新增记录" }));
    const drawer = screen.getByRole("dialog", { name: "新增记录" });
    expect(drawer).toHaveClass("ui-dialog", "ui-drawer", "ui-drawer--default");
    expect(drawer.querySelector(".ui-drawer__body")).toBeInTheDocument();
    fireEvent.change(within(drawer).getByLabelText("标题"), {
      target: { value: "准备发布说明" },
    });
    fireEvent.click(within(drawer).getByRole("button", { name: "保存" }));

    expect(screen.queryByText("准备发布说明")).toBeNull();
    resolveCreate?.(record("record-2", "准备发布说明", "todo"));

    expect(await screen.findByText("准备发布说明")).toBeInTheDocument();
  });

  it("commits inline text edits only after Main confirms the revision", async () => {
    let resolveUpdate:
      | ((
          result: Awaited<ReturnType<WorkbenchTaskApi["updateRecord"]>>,
        ) => void)
      | undefined;
    const api = createApi({
      updateRecord: vi.fn(
        () =>
          new Promise<Awaited<ReturnType<WorkbenchTaskApi["updateRecord"]>>>(
            (resolve) => {
              resolveUpdate = resolve;
            },
          ),
      ),
    });
    renderPage(api);

    fireEvent.click(await screen.findByRole("button", { name: "发布桌面版" }));
    const editor = screen.getByDisplayValue("发布桌面版");
    fireEvent.change(editor, { target: { value: "发布 1.0" } });
    fireEvent.keyDown(editor, { key: "Enter" });

    expect(screen.getByDisplayValue("发布 1.0")).toBeInTheDocument();
    resolveUpdate?.({
      ok: true,
      value: record("record-1", "发布 1.0", "done", 1),
    });

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "发布 1.0" }),
      ).toBeInTheDocument(),
    );
  });

  it("edits multi-select values with ordered tag options", async () => {
    const snapshot = multiSelectSnapshot();
    const updatedRecord = {
      ...snapshot.records[0],
      values: {
        ...snapshot.records[0].values,
        labels: ["todo", "blocked"],
      },
      revision: 1,
    };
    const api = createApi({
      listTables: vi.fn().mockResolvedValue([snapshot.table]),
      getTable: vi.fn().mockResolvedValue(snapshot),
      updateRecord: vi.fn().mockResolvedValue({
        ok: true,
        value: updatedRecord,
      }),
    });
    renderPage(api);
    const table = await screen.findByRole("table", { name: "发布计划" });

    fireEvent.click(within(table).getByRole("button", { name: "待处理" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "阻塞" }));
    fireEvent.keyDown(
      screen.getByRole("button", { name: "发布桌面版 · 标签" }),
      {
        key: "Enter",
      },
    );

    await waitFor(() =>
      expect(api.updateRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          recordId: "record-1",
          values: { labels: ["todo", "blocked"] },
        }),
      ),
    );
  });

  it("commits multi-select tag changes when focus moves outside the cell", async () => {
    const snapshot = multiSelectSnapshot();
    const api = createApi({
      listTables: vi.fn().mockResolvedValue([snapshot.table]),
      getTable: vi.fn().mockResolvedValue(snapshot),
      updateRecord: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          ...snapshot.records[0],
          values: {
            ...snapshot.records[0].values,
            labels: ["todo", "blocked"],
          },
          revision: 1,
        },
      }),
    });
    renderPage(api);
    const table = await screen.findByRole("table", { name: "发布计划" });

    fireEvent.click(within(table).getByRole("button", { name: "待处理" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "阻塞" }));
    fireEvent.pointerDown(document.body);

    await waitFor(() =>
      expect(api.updateRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          values: { labels: ["todo", "blocked"] },
        }),
      ),
    );
  });

  it("cancels local multi-select tag changes with Escape", async () => {
    const snapshot = multiSelectSnapshot();
    const api = createApi({
      listTables: vi.fn().mockResolvedValue([snapshot.table]),
      getTable: vi.fn().mockResolvedValue(snapshot),
    });
    renderPage(api);
    const table = await screen.findByRole("table", { name: "发布计划" });

    fireEvent.click(within(table).getByRole("button", { name: "待处理" }));
    const blockedOption = screen.getByRole("checkbox", { name: "阻塞" });
    fireEvent.click(blockedOption);
    fireEvent.keyDown(blockedOption, {
      key: "Escape",
    });

    expect(api.updateRecord).not.toHaveBeenCalled();
    expect(
      within(table).getByRole("button", { name: "待处理" }),
    ).toBeInTheDocument();
  });

  it("adds multi-select values from tag options in the record drawer", async () => {
    const snapshot = multiSelectSnapshot([]);
    const api = createApi({
      listTables: vi.fn().mockResolvedValue([snapshot.table]),
      getTable: vi.fn().mockResolvedValue(snapshot),
      createRecord: vi.fn().mockResolvedValue({
        ...record("record-2", "准备发布说明", "todo"),
        values: {
          title: "准备发布说明",
          status: "todo",
          labels: ["todo", "blocked"],
        },
      }),
    });
    renderPage(api);
    await screen.findByRole("table", { name: "发布计划" });

    fireEvent.click(screen.getByRole("button", { name: "新增记录" }));
    const drawer = screen.getByRole("dialog", { name: "新增记录" });
    fireEvent.click(within(drawer).getByRole("button", { name: "标签" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "待处理" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "阻塞" }));
    fireEvent.click(within(drawer).getByRole("button", { name: "保存" }));

    await waitFor(() =>
      expect(api.createRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          values: expect.objectContaining({
            labels: ["todo", "blocked"],
          }),
        }),
      ),
    );
  });

  it("renames fields only after Main confirms the table revision", async () => {
    let resolveUpdate:
      | ((result: Awaited<ReturnType<WorkbenchTaskApi["updateField"]>>) => void)
      | undefined;
    const api = createApi({
      updateField: vi.fn(
        () =>
          new Promise<Awaited<ReturnType<WorkbenchTaskApi["updateField"]>>>(
            (resolve) => {
              resolveUpdate = resolve;
            },
          ),
      ),
    });
    renderPage(api);
    await screen.findByRole("table", { name: "发布计划" });

    fireEvent.click(screen.getByRole("button", { name: "新增字段" }));
    const dialog = screen.getByRole("dialog", { name: "管理字段" });
    expect(dialog).toHaveClass("ui-dialog", "ui-dialog--wide");
    expect(dialog.querySelector(".ui-dialog__body")).toBeInTheDocument();
    expect(dialog.querySelectorAll(".ui-field").length).toBeGreaterThanOrEqual(
      2,
    );
    fireEvent.change(within(dialog).getByLabelText("名称"), {
      target: { value: "任务标题" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "保存" }));

    expect(
      screen.getByRole("columnheader", { name: "标题" }),
    ).toBeInTheDocument();
    const snapshot = taskSnapshot();
    resolveUpdate?.({
      ok: true,
      value: {
        ...snapshot.table,
        revision: 1,
        fields: snapshot.table.fields.map((field) =>
          field.id === "title" ? { ...field, name: "任务标题" } : field,
        ),
      },
    });

    expect(
      await screen.findByRole("columnheader", { name: "任务标题" }),
    ).toBeInTheDocument();
  });

  it("shows a mixed header checkbox when some visible rows are selected", async () => {
    const snapshot = taskSnapshot([
      record("record-1", "发布桌面版", "done"),
      record("record-2", "准备发布说明", "todo"),
    ]);
    const api = createApi({
      listTables: vi.fn().mockResolvedValue([snapshot.table]),
      getTable: vi.fn().mockResolvedValue(snapshot),
    });
    renderPage(api);

    const header = await screen.findByRole("checkbox", {
      name: "选择当前页全部记录",
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "选择发布桌面版" }));

    expect(header).not.toBeChecked();
    expect(header).toHaveProperty("indeterminate", true);
    expect(screen.getByRole("button", { name: "删除（1）" })).toHaveClass(
      "ui-button--danger",
      "ui-button--compact",
    );
  });

  it("keeps active view buttons selected and places bulk delete after them", async () => {
    const snapshot = taskSnapshot([
      record("record-1", "发布桌面版", "done"),
      record("record-2", "准备发布说明", "todo"),
    ]);
    snapshot.table.viewState = {
      filters: [{ fieldId: "title", operator: "contains", value: "发布" }],
      filterJoin: "and",
      groups: [{ fieldId: "status", direction: "asc" }],
      sorts: [{ fieldId: "title", direction: "asc" }],
    };
    const api = createApi({
      listTables: vi.fn().mockResolvedValue([snapshot.table]),
      getTable: vi.fn().mockResolvedValue(snapshot),
    });
    renderPage(api);

    const filter = await screen.findByRole("button", { name: "1 筛选" });
    const group = screen.getByRole("button", { name: "1 分组" });
    const sort = screen.getByRole("button", { name: "1 排序" });
    expect(filter).toHaveAttribute("aria-pressed", "true");
    expect(group).toHaveAttribute("aria-pressed", "true");
    expect(sort).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("checkbox", { name: "选择发布桌面版" }));
    const remove = screen.getByRole("button", { name: "删除（1）" });
    expect(
      filter.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      group.compareDocumentPosition(sort) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      sort.compareDocumentPosition(remove) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("keeps selected rows until Main confirms bulk deletion, then reloads counts", async () => {
    let resolveDelete:
      ((result: { deletedRecordIds: string[] }) => void) | undefined;
    const initial = taskSnapshot();
    const empty = taskSnapshot([]);
    const api = createApi({
      listTables: vi
        .fn()
        .mockResolvedValueOnce([initial.table])
        .mockResolvedValueOnce([empty.table]),
      getTable: vi
        .fn()
        .mockResolvedValueOnce(initial)
        .mockResolvedValueOnce(empty),
      bulkDeleteRecords: vi.fn(
        () =>
          new Promise<{ deletedRecordIds: string[] }>((resolve) => {
            resolveDelete = resolve;
          }),
      ),
    });
    renderPage(api);

    fireEvent.click(
      await screen.findByRole("checkbox", { name: "选择发布桌面版" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "删除（1）" }));
    const dialog = screen.getByRole("dialog", { name: "删除记录" });
    fireEvent.click(within(dialog).getByRole("button", { name: "删除" }));

    expect(screen.getByText("发布桌面版")).toBeInTheDocument();
    resolveDelete?.({ deletedRecordIds: ["record-1"] });

    await waitFor(() =>
      expect(screen.queryByText("发布桌面版")).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: "发布计划" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "筛选" })).toHaveFocus(),
    );
    expect(api.bulkDeleteRecords).toHaveBeenCalledWith(
      expect.objectContaining({
        tableId: "table-1",
        recordIds: ["record-1"],
      }),
    );
  });

  it("does not render a completion control after each row checkbox", async () => {
    const api = createApi();
    renderPage(api);

    await screen.findByRole("table", { name: "发布计划" });
    expect(
      screen.queryByRole("button", { name: "标记发布桌面版为完成" }),
    ).toBeNull();
  });

  it("opens an independent filter popover and saves complete conditions", async () => {
    const initial = taskSnapshot();
    const filtered = taskSnapshot();
    filtered.table.viewState = {
      filters: [{ fieldId: "title", operator: "contains", value: "发布" }],
      filterJoin: "and",
      groups: [],
      sorts: [],
    };
    const api = createApi({
      listTables: vi.fn().mockResolvedValue([initial.table]),
      getTable: vi
        .fn()
        .mockResolvedValueOnce(initial)
        .mockResolvedValueOnce(filtered),
      updateTable: vi.fn().mockResolvedValue({
        ok: true,
        value: filtered.table,
      }),
    });
    renderPage(api);
    await screen.findByRole("table", { name: "发布计划" });

    fireEvent.click(screen.getByRole("button", { name: "筛选" }));
    const dialog = screen.getByRole("dialog", { name: "设置筛选条件" });
    expect(within(dialog).queryByText("分组字段")).toBeNull();
    expect(within(dialog).queryByText("排序方向 1")).toBeNull();
    fireEvent.change(within(dialog).getByLabelText("筛选字段 1"), {
      target: { value: "title" },
    });
    fireEvent.change(within(dialog).getByLabelText("筛选值 1"), {
      target: { value: "发布" },
    });

    await waitFor(() =>
      expect(api.updateTable).toHaveBeenCalledWith(
        expect.objectContaining({
          tableId: "table-1",
          expectedRevision: 0,
          viewState: {
            filters: [
              {
                fieldId: "title",
                operator: "contains",
                value: "发布",
              },
            ],
            filterJoin: "and",
            groups: [],
            sorts: [],
          },
        }),
      ),
    );
    expect(
      await screen.findByRole("button", { name: "1 筛选" }),
    ).toBeInTheDocument();
  });

  it("configures one grouped field and its option direction", async () => {
    const initial = taskSnapshot();
    const grouped = taskSnapshot();
    grouped.table.viewState = {
      filters: [],
      filterJoin: "and",
      groups: [{ fieldId: "status", direction: "desc" }],
      sorts: [],
    };
    const api = createApi({
      listTables: vi.fn().mockResolvedValue([initial.table]),
      getTable: vi
        .fn()
        .mockResolvedValueOnce(initial)
        .mockResolvedValue(grouped),
      updateTable: vi.fn().mockResolvedValue({
        ok: true,
        value: grouped.table,
      }),
    });
    renderPage(api);
    await screen.findByRole("table", { name: "发布计划" });

    fireEvent.click(screen.getByRole("button", { name: "分组" }));
    const dialog = screen.getByRole("dialog", { name: "设置分组条件" });
    fireEvent.change(within(dialog).getByLabelText("分组字段 1"), {
      target: { value: "status" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "选项倒序" }));

    await waitFor(() =>
      expect(api.updateTable).toHaveBeenCalledWith(
        expect.objectContaining({
          tableId: "table-1",
          expectedRevision: 0,
          viewState: {
            filters: [],
            filterJoin: "and",
            groups: [{ fieldId: "status", direction: "desc" }],
            sorts: [],
          },
        }),
      ),
    );
    expect(
      await screen.findByRole("button", { name: "1 分组" }),
    ).toBeInTheDocument();
  });

  it("applies grouping after the popover closes during the Main save", async () => {
    let resolveUpdate:
      | ((result: Awaited<ReturnType<WorkbenchTaskApi["updateTable"]>>) => void)
      | undefined;
    const initial = taskSnapshot();
    const grouped = taskSnapshot();
    grouped.table = {
      ...grouped.table,
      revision: 1,
      viewState: {
        filters: [],
        filterJoin: "and",
        groups: [{ fieldId: "status", direction: "asc" }],
        sorts: [],
      },
    };
    grouped.groupTree = [
      {
        fieldId: "status",
        value: "done",
        count: 1,
        children: [],
        recordIds: ["record-1"],
      },
    ];
    const api = createApi({
      listTables: vi.fn().mockResolvedValue([initial.table]),
      getTable: vi
        .fn()
        .mockResolvedValueOnce(initial)
        .mockResolvedValue(grouped),
      updateTable: vi.fn(
        () =>
          new Promise<Awaited<ReturnType<WorkbenchTaskApi["updateTable"]>>>(
            (resolve) => {
              resolveUpdate = resolve;
            },
          ),
      ),
    });
    renderPage(api);
    await screen.findByRole("table", { name: "发布计划" });

    fireEvent.click(screen.getByRole("button", { name: "分组" }));
    fireEvent.change(
      within(
        screen.getByRole("dialog", { name: "设置分组条件" }),
      ).getByLabelText("分组字段 1"),
      { target: { value: "status" } },
    );
    fireEvent.pointerDown(screen.getByRole("table", { name: "发布计划" }));

    expect(screen.queryByRole("dialog", { name: "设置分组条件" })).toBeNull();
    await waitFor(() => expect(api.updateTable).toHaveBeenCalled());
    resolveUpdate?.({ ok: true, value: grouped.table });

    expect(await screen.findByText("完成 · 1")).toBeInTheDocument();
    expect(api.getTable).toHaveBeenLastCalledWith("table-1");
  });

  it("opens an independent sort popover and saves sort priority", async () => {
    const initial = taskSnapshot();
    const sorted = taskSnapshot();
    sorted.table.viewState = {
      filters: [],
      filterJoin: "and",
      groups: [],
      sorts: [{ fieldId: "title", direction: "desc" }],
    };
    const api = createApi({
      listTables: vi.fn().mockResolvedValue([initial.table]),
      getTable: vi
        .fn()
        .mockResolvedValueOnce(initial)
        .mockResolvedValue(sorted),
      updateTable: vi.fn().mockResolvedValue({
        ok: true,
        value: sorted.table,
      }),
    });
    renderPage(api);
    await screen.findByRole("table", { name: "发布计划" });

    fireEvent.click(screen.getByRole("button", { name: "排序" }));
    const dialog = screen.getByRole("dialog", { name: "设置排序条件" });
    fireEvent.change(within(dialog).getByLabelText("排序字段 1"), {
      target: { value: "title" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "降序" }));

    await waitFor(() =>
      expect(api.updateTable).toHaveBeenCalledWith(
        expect.objectContaining({
          viewState: {
            filters: [],
            filterJoin: "and",
            groups: [],
            sorts: [{ fieldId: "title", direction: "desc" }],
          },
        }),
      ),
    );
    expect(
      await screen.findByRole("button", { name: "1 排序" }),
    ).toBeInTheDocument();
  });

  it("creates an unnamed table immediately without opening a name dialog", async () => {
    const created = taskSnapshot([]);
    created.table.name = "未命名";
    const api = createApi({
      listTables: vi.fn().mockResolvedValue([]),
      createTable: vi.fn().mockResolvedValue(created),
    });
    renderPage(api);

    const createButton = await screen.findByRole("button", {
      name: "新建表格",
    });
    expect(within(createButton).queryByText("新建表格")).toBeNull();
    expect(createButton).toHaveAttribute("title", "新增");
    fireEvent.click(createButton);

    expect(api.createTable).toHaveBeenCalledWith({
      requestId: expect.any(String),
      name: "未命名",
    });
    expect(screen.queryByRole("dialog", { name: "新建表格" })).toBeNull();
    expect(
      await screen.findByRole("button", { name: "未命名" }),
    ).toBeInTheDocument();
  });

  it("renames a table on Enter only after Main confirms", async () => {
    let resolveUpdate:
      | ((result: Awaited<ReturnType<WorkbenchTaskApi["updateTable"]>>) => void)
      | undefined;
    const api = createApi({
      updateTable: vi.fn(
        () =>
          new Promise<Awaited<ReturnType<WorkbenchTaskApi["updateTable"]>>>(
            (resolve) => {
              resolveUpdate = resolve;
            },
          ),
      ),
    });
    renderPage(api);

    fireEvent.doubleClick(
      await screen.findByRole("button", { name: "发布计划" }),
    );
    const input = screen.getByRole("textbox", { name: "编辑发布计划" });
    fireEvent.change(input, { target: { value: "发布安排" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(
      screen.getByRole("textbox", { name: "编辑发布计划" }),
    ).toBeInTheDocument();
    resolveUpdate?.({
      ok: true,
      value: {
        ...taskSnapshot().table,
        name: "发布安排",
        revision: 1,
      },
    });
    expect(
      await screen.findByRole("button", { name: "发布安排" }),
    ).toBeInTheDocument();
  });

  it("offers structure-only and structure-with-data copy modes", async () => {
    const copy = taskSnapshot([]);
    copy.table.id = "table-copy";
    copy.table.name = "发布计划 副本";
    const api = createApi({
      duplicateTable: vi.fn().mockResolvedValue(copy),
    });
    renderPage(api);

    fireEvent.click(
      await screen.findByRole("button", { name: "复制发布计划" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "仅复制结构" }));

    expect(api.duplicateTable).toHaveBeenCalledWith(
      expect.objectContaining({
        tableId: "table-1",
        mode: "structure",
      }),
    );
  });

  it("permanently deletes a table only after confirmation", async () => {
    const initial = taskSnapshot();
    const api = createApi({
      listTables: vi
        .fn()
        .mockResolvedValueOnce([initial.table])
        .mockResolvedValueOnce([]),
      deleteTable: vi.fn().mockResolvedValue({
        ok: true,
        value: { tableId: "table-1" },
      }),
    });
    renderPage(api);
    await screen.findByRole("table", { name: "发布计划" });

    fireEvent.click(screen.getByRole("button", { name: "删除发布计划" }));
    const dialog = screen.getByRole("dialog", { name: "删除表格" });
    fireEvent.click(within(dialog).getByRole("button", { name: "删除" }));

    expect(api.deleteTable).toHaveBeenCalledWith(
      expect.objectContaining({
        tableId: "table-1",
        expectedRevision: 0,
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "发布计划" })).toBeNull(),
    );
    expect(api.listTables).toHaveBeenCalledTimes(2);
  });

  it("loads the next 100-record page from Main", async () => {
    const first = {
      ...taskSnapshot([record("record-1", "第一页任务", "todo")]),
      total: 101,
    };
    const second = {
      ...taskSnapshot([record("record-101", "第二页任务", "done")]),
      total: 101,
      page: 2,
    };
    const api = createApi({
      listTables: vi.fn().mockResolvedValue([first.table]),
      getTable: vi
        .fn()
        .mockResolvedValueOnce(first)
        .mockResolvedValueOnce(second),
    });
    renderPage(api);

    fireEvent.click(await screen.findByRole("button", { name: "下一页" }));

    expect(await screen.findByText("第二页任务")).toBeInTheDocument();
    expect(api.getTable).toHaveBeenLastCalledWith("table-1", { page: 2 });
    expect(screen.getByText("第 2 / 2 页")).toBeInTheDocument();
  });

  it("keeps a 1,000-record table bounded to the 100 records returned by Main", async () => {
    const pageRecords = Array.from({ length: 100 }, (_, index) =>
      record(`record-${index + 1}`, `任务 ${index + 1}`, "todo"),
    );
    const first = {
      ...taskSnapshot(pageRecords),
      total: 1_000,
      pageSize: 100,
    };
    const api = createApi({
      listTables: vi.fn().mockResolvedValue([first.table]),
      getTable: vi.fn().mockResolvedValue(first),
    });
    renderPage(api);

    const table = await screen.findByRole("table", { name: "发布计划" });
    expect(within(table).getAllByRole("row")).toHaveLength(101);
    expect(screen.getByText("第 1 / 10 页")).toBeInTheDocument();
  });

  it("renders records under hierarchical group headings", async () => {
    const snapshot = taskSnapshot([
      record("record-1", "发布桌面版", "done"),
      record("record-2", "整理文档", "todo"),
    ]);
    snapshot.table.viewState = {
      filters: [],
      filterJoin: "and",
      groups: [
        { fieldId: "status", direction: "asc" },
        { fieldId: "title", direction: "asc" },
      ],
      sorts: [],
    };
    snapshot.groupTree = [
      {
        fieldId: "status",
        value: "done",
        count: 1,
        recordIds: [],
        children: [
          {
            fieldId: "title",
            value: "发布桌面版",
            count: 1,
            children: [],
            recordIds: ["record-1"],
          },
        ],
      },
      {
        fieldId: "status",
        value: "todo",
        count: 1,
        recordIds: [],
        children: [
          {
            fieldId: "title",
            value: "整理文档",
            count: 1,
            children: [],
            recordIds: ["record-2"],
          },
        ],
      },
    ];
    const api = createApi({
      listTables: vi.fn().mockResolvedValue([snapshot.table]),
      getTable: vi.fn().mockResolvedValue(snapshot),
    });
    renderPage(api);

    expect(await screen.findByText("完成 · 1")).toBeInTheDocument();
    expect(screen.getByText("发布桌面版 · 1")).toBeInTheDocument();
    expect(screen.getByText("待处理 · 1")).toBeInTheDocument();
    expect(screen.getByText("整理文档 · 1")).toBeInTheDocument();
  });

  it("normalizes cached snapshots created before hierarchical groups", async () => {
    const current = taskSnapshot();
    const legacy = {
      ...current,
      table: {
        ...current.table,
        viewState: {
          filters: [],
          filterJoin: "and",
          sorts: [],
        },
      },
    } as unknown as WorkbenchTaskTableSnapshot;
    delete (legacy as Partial<WorkbenchTaskTableSnapshot>).groupTree;
    const api = createApi({
      listTables: vi.fn().mockResolvedValue([legacy.table]),
      getTable: vi.fn().mockResolvedValue(legacy),
    });

    renderPage(api);

    expect(
      await screen.findByRole("table", { name: "发布计划" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "分组" })).toBeInTheDocument();
    expect(screen.getByText("发布桌面版")).toBeInTheDocument();
  });
});

function renderPage(api: WorkbenchTaskApi): void {
  render(
    <LocalizationProvider>
      <TaskWorkbenchPage api={api} attachmentsApi={createAttachmentApi()} />
    </LocalizationProvider>,
  );
}

function createAttachmentApi(): WorkbenchAttachmentApi {
  return {
    list: vi.fn().mockResolvedValue([]),
    pickAndAttach: vi.fn(),
    readImage: vi.fn(),
    open: vi.fn(),
    reveal: vi.fn(),
    delete: vi.fn(),
  };
}

function createApi(
  overrides: Partial<WorkbenchTaskApi> = {},
): WorkbenchTaskApi {
  const snapshot = taskSnapshot();
  return {
    listTables: vi.fn().mockResolvedValue([snapshot.table]),
    getTable: vi.fn().mockResolvedValue(snapshot),
    createTable: vi.fn(),
    updateTable: vi.fn(),
    deleteTable: vi.fn(),
    duplicateTable: vi.fn(),
    createField: vi.fn(),
    updateField: vi.fn(),
    deleteField: vi.fn(),
    createRecord: vi.fn(),
    updateRecord: vi.fn(),
    bulkDeleteRecords: vi.fn(),
    ...overrides,
  };
}

function taskSnapshot(
  records = [record("record-1", "发布桌面版", "done")],
): WorkbenchTaskTableSnapshot {
  return {
    table: {
      id: "table-1",
      name: "发布计划",
      position: 0,
      recordCount: records.length,
      revision: 0,
      createdAt: 1,
      updatedAt: 1,
      viewState: { filters: [], filterJoin: "and", groups: [], sorts: [] },
      fields: [
        {
          id: "title",
          tableId: "table-1",
          name: "标题",
          fieldType: "text",
          config: {},
          position: 0,
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: "status",
          tableId: "table-1",
          name: "状态",
          fieldType: "single_select",
          config: {
            options: [
              { id: "todo", label: "待处理", color: "gray" },
              { id: "done", label: "完成", color: "green" },
            ],
          },
          position: 10,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    },
    records,
    total: records.length,
    page: 1,
    pageSize: 100,
    groupTree: [],
  };
}

function multiSelectSnapshot(
  records?: WorkbenchTaskRecord[],
): WorkbenchTaskTableSnapshot {
  const baseRecord = record("record-1", "发布桌面版", "done");
  const snapshot = taskSnapshot(
    records ?? [
      {
        ...baseRecord,
        values: { ...baseRecord.values, labels: ["todo"] },
      },
    ],
  );
  return {
    ...snapshot,
    table: {
      ...snapshot.table,
      fields: [
        ...snapshot.table.fields,
        {
          id: "labels",
          tableId: "table-1",
          name: "标签",
          fieldType: "multi_select",
          config: {
            options: [
              { id: "todo", label: "待处理", color: "gray" },
              { id: "blocked", label: "阻塞", color: "red" },
              { id: "done", label: "完成", color: "green" },
            ],
          },
          position: 20,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    },
  };
}

function record(
  id: string,
  title: string,
  status: string,
  revision = 0,
): WorkbenchTaskRecord {
  return {
    id,
    tableId: "table-1",
    values: { title, status },
    position: id === "record-1" ? 0 : 10,
    revision,
    createdAt: 1,
    updatedAt: 1,
  };
}
