import { describe, expect, it } from "vitest";
import {
  normalizeTaskRecordValues,
  parseCreateTaskFieldCommand,
  parseTaskViewState,
  type WorkbenchTaskField,
} from "./workbench-tasks";
import {
  parseDuplicateTaskTableCommand,
  parseUpdateTaskRecordCommand,
} from "./workbench-task-commands";

describe("workbench task contract", () => {
  it("normalizes values against the current field definitions", () => {
    const fields: WorkbenchTaskField[] = [
      field("title", "text"),
      field("due", "date"),
      field("status", "single_select", {
        options: [
          { id: "todo", label: "待处理", color: "gray" },
          { id: "done", label: "完成", color: "green" },
        ],
      }),
      field("labels", "multi_select", {
        options: [
          { id: "urgent", label: "紧急", color: "red" },
          { id: "later", label: "稍后", color: "blue" },
        ],
      }),
      field("reference", "url"),
      field("files", "attachment"),
    ];

    expect(
      normalizeTaskRecordValues(
        {
          title: "  发布桌面版  ",
          due: 1_800_000_000_000,
          status: "done",
          labels: ["later", "urgent", "later"],
          reference: "https://realmflow.local/release",
          files: ["attachment-2", "attachment-1", "attachment-2"],
        },
        fields,
      ),
    ).toEqual({
      title: "发布桌面版",
      due: 1_800_000_000_000,
      status: "done",
      labels: ["later", "urgent"],
      reference: "https://realmflow.local/release",
      files: ["attachment-2", "attachment-1"],
    });
  });

  it("rejects unknown fields and values that do not match field config", () => {
    const fields: WorkbenchTaskField[] = [
      field("status", "single_select", {
        options: [{ id: "todo", label: "待处理", color: "gray" }],
      }),
    ];

    expect(() =>
      normalizeTaskRecordValues({ removed: "value" }, fields),
    ).toThrow("unknown field");
    expect(() =>
      normalizeTaskRecordValues({ status: "done" }, fields),
    ).toThrow("status");
  });

  it("validates select options and command concurrency metadata", () => {
    expect(
      parseCreateTaskFieldCommand({
        requestId: "request-1",
        tableId: "table-1",
        expectedRevision: 2,
        name: "状态",
        fieldType: "single_select",
        config: {
          options: [
            { id: "todo", label: "待处理", color: "gray" },
            { id: "done", label: "完成", color: "green" },
          ],
        },
      }),
    ).toMatchObject({
      requestId: "request-1",
      expectedRevision: 2,
      fieldType: "single_select",
    });

    expect(() =>
      parseCreateTaskFieldCommand({
        requestId: "request-1",
        tableId: "table-1",
        expectedRevision: 0,
        name: "状态",
        fieldType: "single_select",
        config: {
          options: [
            { id: "duplicate", label: "A", color: "gray" },
            { id: "duplicate", label: "B", color: "blue" },
          ],
        },
      }),
    ).toThrow("options");
  });

  it("normalizes persisted view state with stable sorting", () => {
    expect(
      parseTaskViewState({
        filters: [
          { fieldId: "status", operator: "equals", value: "todo" },
        ],
        filterJoin: "and",
        groups: [
          { fieldId: "status", direction: "asc" },
          { fieldId: "owner", direction: "desc" },
        ],
        sorts: [
          { fieldId: "due", direction: "asc" },
          { fieldId: "title", direction: "desc" },
        ],
      }),
    ).toEqual({
      filters: [
        { fieldId: "status", operator: "equals", value: "todo" },
      ],
      filterJoin: "and",
      groups: [
        { fieldId: "status", direction: "asc" },
        { fieldId: "owner", direction: "desc" },
      ],
      sorts: [
        { fieldId: "due", direction: "asc" },
        { fieldId: "title", direction: "desc" },
      ],
    });
  });

  it("parses explicit table duplication modes", () => {
    expect(
      parseDuplicateTaskTableCommand({
        requestId: "request-1",
        tableId: "table-1",
        mode: "structure",
      }),
    ).toEqual({
      requestId: "request-1",
      tableId: "table-1",
      mode: "structure",
    });
    expect(
      parseDuplicateTaskTableCommand({
        requestId: "request-2",
        tableId: "table-1",
        mode: "structure_and_data",
      }),
    ).toEqual({
      requestId: "request-2",
      tableId: "table-1",
      mode: "structure_and_data",
    });
    expect(() =>
      parseDuplicateTaskTableCommand({
        requestId: "request-3",
        tableId: "table-1",
        mode: "everything",
      }),
    ).toThrow("mode");
  });

  it("rejects the removed record completion command", () => {
    expect(() =>
      parseUpdateTaskRecordCommand({
        requestId: "request-1",
        tableId: "table-1",
        recordId: "record-1",
        expectedRevision: 0,
        completed: true,
      }),
    ).toThrow("completed");
  });

  it("normalizes ordered hierarchical groups", () => {
    expect(
      parseTaskViewState({
        filters: [],
        filterJoin: "and",
        groups: [
          { fieldId: "status", direction: "desc" },
          { fieldId: "owner", direction: "asc" },
        ],
        sorts: [],
      }),
    ).toEqual({
      filters: [],
      filterJoin: "and",
      groups: [
        { fieldId: "status", direction: "desc" },
        { fieldId: "owner", direction: "asc" },
      ],
      sorts: [],
    });
    expect(
      parseTaskViewState({
        filters: [],
        filterJoin: "and",
        sorts: [],
      }),
    ).toEqual({
      filters: [],
      filterJoin: "and",
      groups: [],
      sorts: [],
    });
    expect(() =>
      parseTaskViewState({
        filters: [],
        filterJoin: "and",
        groups: [{ fieldId: "status", direction: "sideways" }],
        sorts: [],
      }),
    ).toThrow("groups[0].direction");
    expect(() =>
      parseTaskViewState({
        filters: [],
        filterJoin: "and",
        groups: [
          { fieldId: "status", direction: "asc" },
          { fieldId: "status", direction: "desc" },
        ],
        sorts: [],
      }),
    ).toThrow("duplicate");
  });
});

function field(
  id: string,
  fieldType: WorkbenchTaskField["fieldType"],
  config: WorkbenchTaskField["config"] = {},
): WorkbenchTaskField {
  return {
    id,
    tableId: "table-1",
    name: id,
    fieldType,
    config,
    position: 0,
    createdAt: 1,
    updatedAt: 1,
  };
}
