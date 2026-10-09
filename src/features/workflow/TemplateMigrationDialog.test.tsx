import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, vi } from "vitest";
import type {
  TemplateMigrationCandidateListDto,
  TemplateMigrationPreviewDto,
} from "../../../shared/business";
import { LocalizationProvider } from "../../localization/LocalizationProvider";
import { ToastProvider } from "../toast/ToastProvider";
import { TemplateMigrationDialog } from "./TemplateMigrationDialog";

const candidates: TemplateMigrationCandidateListDto = {
  currentVersion: {
    id: "template-v1",
    version: 1,
    checksum: "checksum-v1",
    nodeCount: 2,
    edgeCount: 1,
  },
  candidates: [
    {
      id: "template-v3",
      version: 3,
      checksum: "checksum-v3",
      nodeCount: 3,
      edgeCount: 2,
    },
    {
      id: "template-v2",
      version: 2,
      checksum: "checksum-v2",
      nodeCount: 2,
      edgeCount: 1,
    },
  ],
};

afterEach(() => {
  delete window.realmflow;
});

it("selects the newest candidate and groups the instance diff", async () => {
  const preview = previewFor("template-v3", 3);
  installApi({
    listTemplateMigrationCandidates: vi.fn().mockResolvedValue(candidates),
    previewTemplateMigration: vi.fn().mockResolvedValue(preview),
  });

  renderDialog();

  const dialog = screen.getByRole("dialog", { name: "迁移到新模板版本" });
  expect(dialog).toHaveClass("ui-dialog", "ui-dialog--wide");
  expect(dialog.parentElement).toHaveClass("ui-dialog-backdrop");
  const target = await screen.findByRole("combobox", {
    name: "目标模板版本",
  });
  expect(target.closest(".ui-field")).not.toBeNull();
  expect(
    screen.getByRole("button", { name: "确认迁移" }),
  ).toHaveClass("ui-button", "ui-button--primary");
  expect(target).toHaveValue("template-v3");
  expect(await screen.findByText("新增节点")).toBeInTheDocument();
  expect(screen.getByText("Review")).toBeInTheDocument();
  expect(screen.getByText("移除节点")).toBeInTheDocument();
  expect(screen.getByText("Custom delivery")).toBeInTheDocument();
  expect(screen.getByText("配置与内容变化")).toBeInTheDocument();
  expect(screen.getByText(/名称、配置/)).toBeInTheDocument();
  expect(screen.getByText("连线变化")).toBeInTheDocument();
});

it("shows an empty state and cancelling never applies a migration", async () => {
  const applyTemplateMigration = vi.fn();
  installApi({
    listTemplateMigrationCandidates: vi.fn().mockResolvedValue({
      ...candidates,
      candidates: [],
    }),
    previewTemplateMigration: vi.fn(),
    applyTemplateMigration,
  });
  const onClose = vi.fn();

  renderDialog({ onClose });

  expect(
    await screen.findByText("当前没有可迁移的新版本"),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "取消" }));
  expect(onClose).toHaveBeenCalledOnce();
  expect(applyTemplateMigration).not.toHaveBeenCalled();
});

it("keeps only the latest preview when targets change quickly", async () => {
  const v3 = deferred<TemplateMigrationPreviewDto>();
  const v2 = deferred<TemplateMigrationPreviewDto>();
  installApi({
    listTemplateMigrationCandidates: vi.fn().mockResolvedValue(candidates),
    previewTemplateMigration: vi
      .fn()
      .mockReturnValueOnce(v3.promise)
      .mockReturnValueOnce(v2.promise),
  });

  renderDialog();
  const target = await screen.findByRole("combobox", {
    name: "目标模板版本",
  });
  fireEvent.change(target, { target: { value: "template-v2" } });
  v2.resolve(previewFor("template-v2", 2, "V2 review"));
  expect(await screen.findByText("V2 review")).toBeInTheDocument();
  v3.resolve(previewFor("template-v3", 3, "Stale V3 review"));

  await waitFor(() =>
    expect(screen.queryByText("Stale V3 review")).not.toBeInTheDocument(),
  );
});

it("submits preview revisions once and applies the confirmed workflow", async () => {
  const preview = previewFor("template-v3", 3);
  const pending = deferred<ReturnType<typeof migrationResult>>();
  const applyTemplateMigration = vi.fn().mockReturnValue(pending.promise);
  const onApplied = vi.fn();
  const onClose = vi.fn();
  installApi({
    listTemplateMigrationCandidates: vi.fn().mockResolvedValue(candidates),
    previewTemplateMigration: vi.fn().mockResolvedValue(preview),
    applyTemplateMigration,
  });

  renderDialog({ onApplied, onClose });
  const confirm = await screen.findByRole("button", { name: "确认迁移" });
  fireEvent.click(confirm);

  expect(confirm).toBeDisabled();
  expect(applyTemplateMigration).toHaveBeenCalledWith({
    requestId: expect.any(String),
    requirementId: "requirement-1",
    targetTemplateVersionId: "template-v3",
    expectedRequirementRevision: 3,
    expectedWorkflowRevision: 4,
    expectedExecutionRevision: 5,
  });
  const result = migrationResult();
  pending.resolve(result);
  await waitFor(() => expect(onApplied).toHaveBeenCalledWith(result.workflow));
  expect(onClose).toHaveBeenCalledOnce();
});

it("refreshes a stale preview without replacing the workflow on failure", async () => {
  const listTemplateMigrationCandidates = vi
    .fn()
    .mockResolvedValue(candidates);
  const previewTemplateMigration = vi
    .fn()
    .mockResolvedValue(previewFor("template-v3", 3));
  const applyTemplateMigration = vi
    .fn()
    .mockRejectedValueOnce(new Error("Requirement revision conflict"))
    .mockRejectedValueOnce(new Error("Database unavailable"));
  const onApplied = vi.fn();
  installApi({
    listTemplateMigrationCandidates,
    previewTemplateMigration,
    applyTemplateMigration,
  });

  renderDialog({ onApplied });
  fireEvent.click(await screen.findByRole("button", { name: "确认迁移" }));

  expect(
    await screen.findByText("流程已变化，已重新生成迁移预览"),
  ).toBeInTheDocument();
  await waitFor(() =>
    expect(previewTemplateMigration).toHaveBeenCalledTimes(2),
  );
  fireEvent.click(screen.getByRole("button", { name: "确认迁移" }));
  expect(
    await screen.findByText("迁移失败：未知错误"),
  ).toBeInTheDocument();
  expect(screen.queryByText("Database unavailable")).not.toBeInTheDocument();
  expect(onApplied).not.toHaveBeenCalled();
});

function renderDialog(
  overrides: Partial<React.ComponentProps<typeof TemplateMigrationDialog>> = {},
) {
  return render(
    <LocalizationProvider>
      <ToastProvider>
        <TemplateMigrationDialog
          requirementId="requirement-1"
          onApplied={vi.fn()}
          onClose={vi.fn()}
          {...overrides}
        />
      </ToastProvider>
    </LocalizationProvider>,
  );
}

function installApi(overrides: Record<string, unknown>): void {
  window.realmflow = {
    business: {
      listTemplateMigrationCandidates: vi.fn(),
      previewTemplateMigration: vi.fn(),
      applyTemplateMigration: vi.fn(),
      ...overrides,
    },
  } as never;
}

function previewFor(
  targetTemplateVersionId: string,
  version: number,
  addedName = "Review",
): TemplateMigrationPreviewDto {
  return {
    requirementId: "requirement-1",
    sourceVersion: candidates.currentVersion,
    targetVersion:
      candidates.candidates.find(
        (candidate) => candidate.id === targetTemplateVersionId,
      ) ?? candidates.candidates[0],
    requirementRevision: 3,
    workflowRevision: 4,
    executionRevision: 5,
    diff: {
      addedNodes: [{ id: "requirement-1:review", name: addedName }],
      removedNodes: [
        { id: "requirement-1:delivery", name: "Custom delivery" },
      ],
      updatedNodes: [
        {
          id: "requirement-1:analysis",
          sourceName: "Custom analysis",
          targetName: "Analysis",
          changedFields: ["name", "configuration"],
        },
      ],
      reorderedNodes: [{ id: "requirement-1:analysis", from: 1, to: 0 }],
      addedEdges: ["requirement-1:edge:analysis:review"],
      removedEdges: ["requirement-1:edge:analysis:delivery"],
      targetWorkflow: {
        requirementId: "requirement-1",
        templateVersionId: targetTemplateVersionId,
        revision: 4,
        maxParallelism: 1,
        nodes: [
          {
            id: "requirement-1:analysis",
            type: "ai_generate",
            name: "Analysis",
            description: "",
            order: 0,
            status: "ready",
            allowSkip: false,
          },
          {
            id: "requirement-1:review",
            type: "approval",
            name: addedName,
            description: "",
            order: 1,
            status: "pending",
            allowSkip: false,
          },
        ],
        edges: [
          {
            id: "requirement-1:edge:analysis:review",
            sourceNodeId: "requirement-1:analysis",
            targetNodeId: "requirement-1:review",
          },
        ],
      },
    },
  };
}

function migrationResult() {
  const preview = previewFor("template-v3", 3);
  return {
    outcome: "applied" as const,
    migrationRecordId: "migration-1",
    requirementRevision: 4,
    executionRevision: 6,
    targetVersion: preview.targetVersion,
    workflow: { ...preview.diff.targetWorkflow, revision: 5 },
    diff: preview.diff,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}
