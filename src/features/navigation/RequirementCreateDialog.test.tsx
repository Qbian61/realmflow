import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BusinessApi } from "../../../shared/business";
import { LocalizationProvider } from "../../localization/LocalizationProvider";
import { ToastProvider } from "../toast/ToastProvider";
import { RequirementCreateDialog } from "./RequirementCreateDialog";

type TestBusiness = Pick<
  BusinessApi,
  "listWorkflowTemplates" | "listWorkflowTemplateLibrary"
>;

function renderDialog(
  business: TestBusiness,
  onCreate = vi.fn(),
): void {
  render(
    <LocalizationProvider>
      <ToastProvider>
        <RequirementCreateDialog
          business={business as BusinessApi}
          spaceLabel="RealmFlow"
          onClose={vi.fn()}
          onCreate={onCreate}
        />
      </ToastProvider>
    </LocalizationProvider>,
  );
}

describe("RequirementCreateDialog", () => {
  it("requires an explicitly selected published template version", async () => {
    const onCreate = vi.fn();
    renderDialog(
      {
        listWorkflowTemplates: vi.fn().mockResolvedValue([
          {
            id: "version-published",
            templateId: "template-1",
            version: 2,
            status: "published",
            checksum: "published",
            nodes: [],
            edges: [],
          },
          {
            id: "version-draft",
            templateId: "template-1",
            version: 3,
            status: "draft",
            checksum: "draft",
            nodes: [],
            edges: [],
          },
        ]),
        listWorkflowTemplateLibrary: vi.fn().mockResolvedValue([
          {
            id: "template-1",
            name: "Standard delivery",
            description: "",
            status: "published",
            revision: 1,
            createdAt: 1,
            updatedAt: 1,
            currentVersion: {
              id: "version-published",
              version: 2,
              status: "published",
              checksum: "published",
              nodeCount: 0,
              edgeCount: 0,
            },
          },
        ]),
      },
      onCreate,
    );

    const template = await screen.findByRole("combobox", { name: "流程模板" });
    const dialog = screen.getByRole("dialog", { name: "新建需求" });
    expect(dialog).toHaveClass("ui-dialog", "ui-dialog--compact");
    expect(
      screen.getByRole("textbox", { name: "需求名称" }).closest(".ui-field"),
    ).not.toBeNull();
    expect(within(template).getByText("Standard delivery · v2")).toBeVisible();
    expect(within(template).queryByText(/v3/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "需求名称" }), {
      target: { value: "  Improve workflow  " },
    });
    expect(
      screen.getByRole("button", { name: "确认新建需求" }),
    ).toHaveClass("ui-button", "ui-button--primary");

    fireEvent.change(template, { target: { value: "version-published" } });
    fireEvent.click(screen.getByRole("button", { name: "确认新建需求" }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(
        "Improve workflow",
        "version-published",
      ),
    );
  });

  it("does not submit when no published template exists", async () => {
    const onCreate = vi.fn();
    renderDialog(
      {
        listWorkflowTemplates: vi.fn().mockResolvedValue([]),
        listWorkflowTemplateLibrary: vi.fn().mockResolvedValue([]),
      },
      onCreate,
    );

    const template = await screen.findByRole("combobox", { name: "流程模板" });
    expect(template).toBeDisabled();
    expect(template).toHaveTextContent("暂无已发布的流程模板");
    expect(
      screen.getByRole("button", { name: "确认新建需求" }),
    ).toBeDisabled();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("shows a load error and keeps submission disabled", async () => {
    const onCreate = vi.fn();
    renderDialog(
      {
        listWorkflowTemplates: vi.fn().mockRejectedValue(new Error("offline")),
        listWorkflowTemplateLibrary: vi.fn().mockResolvedValue([]),
      },
      onCreate,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("流程模板加载失败");
    expect(screen.getByRole("combobox", { name: "流程模板" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "确认新建需求" }),
    ).toBeDisabled();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("reports create failures as Toast without replacing template load state", async () => {
    const onCreate = vi.fn().mockRejectedValue(new Error("private path"));
    renderDialog(
      {
        listWorkflowTemplates: vi
          .fn()
          .mockResolvedValue([workflowVersion("version-1", "template-1", 1)]),
        listWorkflowTemplateLibrary: vi
          .fn()
          .mockResolvedValue([
            workflowTemplate("template-1", "Delivery", "version-1", 1),
          ]),
      },
      onCreate,
    );

    fireEvent.change(
      await screen.findByRole("textbox", { name: "需求名称" }),
      { target: { value: "New requirement" } },
    );
    fireEvent.change(screen.getByRole("combobox", { name: "流程模板" }), {
      target: { value: "version-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "确认新建需求" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveClass("toast-message");
    expect(alert).toHaveTextContent(
      "需求未创建，现有数据未受影响。请刷新后重试。",
    );
    expect(document.querySelector(".name-dialog-error")).toBeNull();
    expect(screen.queryByText("private path")).not.toBeInTheDocument();
  });

  it("shows all published templates without a search control", async () => {
    renderDialog({
      listWorkflowTemplates: vi.fn().mockResolvedValue([
        workflowVersion("version-1", "template-1", 1),
        workflowVersion("version-2", "template-2", 2),
        workflowVersion("version-3", "template-3", 3),
      ]),
      listWorkflowTemplateLibrary: vi.fn().mockResolvedValue([
        workflowTemplate("template-1", "Selected delivery", "version-1", 1),
        workflowTemplate("template-2", "Planning flow", "version-2", 2),
        workflowTemplate("template-3", "Hidden flow", "version-3", 3),
      ]),
    });

    const template = await screen.findByRole("combobox", { name: "流程模板" });
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(within(template).getByText("Selected delivery · v1")).toBeVisible();
    expect(within(template).getByText("Planning flow · v2")).toBeVisible();
    expect(within(template).getByText("Hidden flow · v3")).toBeVisible();
  });
});

function workflowVersion(
  id: string,
  templateId: string,
  version: number,
) {
  return {
    id,
    templateId,
    version,
    status: "published" as const,
    checksum: id,
    nodes: [],
    edges: [],
  };
}

function workflowTemplate(
  id: string,
  name: string,
  versionId: string,
  version: number,
) {
  return {
    id,
    name,
    description: "",
    status: "published" as const,
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
    currentVersion: {
      id: versionId,
      version,
      status: "published" as const,
      checksum: versionId,
      nodeCount: 0,
      edgeCount: 0,
    },
  };
}
