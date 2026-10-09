import { render, screen } from "@testing-library/react";
import type { WorkbenchAttachmentApi } from "../../../../shared/workbench-attachments";
import type {
  WorkbenchTaskApi,
  WorkbenchTaskField,
} from "../../../../shared/workbench-tasks";
import { LocalizationProvider } from "../../../localization/LocalizationProvider";
import { TaskRecordDrawer } from "./TaskRecordDrawer";

const fields = [
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
      options: [{ id: "todo", label: "待处理", color: "gray" }],
    },
    position: 1,
    createdAt: 1,
    updatedAt: 1,
  },
] as WorkbenchTaskField[];

describe("TaskRecordDrawer", () => {
  it("uses shared fields and default footer buttons for native controls", () => {
    render(
      <LocalizationProvider>
        <TaskRecordDrawer
          fields={fields}
          attachments={{} as WorkbenchAttachmentApi}
          tasks={{} as WorkbenchTaskApi}
          saving={false}
          onClose={vi.fn()}
          onRecordUpdated={vi.fn()}
          onSave={vi.fn(async () => undefined)}
        />
      </LocalizationProvider>,
    );

    const title = screen.getByLabelText("标题");
    const status = screen.getByLabelText("状态");
    expect(title.closest(".ui-field")).not.toBeNull();
    expect(status.closest(".ui-field")).not.toBeNull();
    expect(title).toHaveAttribute("name", "task-record-new-title");
    expect(status).toHaveAttribute("name", "task-record-new-status");
    expect(title).toHaveAttribute("autocomplete", "off");
    expect(status).toHaveAttribute("autocomplete", "off");
    expect(screen.getByRole("button", { name: "取消" })).toHaveClass(
      "ui-button--default",
    );
    expect(screen.getByRole("button", { name: "保存" })).toHaveClass(
      "ui-button--default",
      "ui-button--primary",
    );
  });
});
