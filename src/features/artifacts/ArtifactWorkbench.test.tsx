import {
  fireEvent,
  render as testingRender,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { vi } from "vitest";
import type { WorkspaceApi, WorkspaceFile } from "../../../shared/workspace";
import { LocalizationProvider } from "../../localization/LocalizationProvider";
import { ToastProvider } from "../toast/ToastProvider";
import { UnsavedChangesProvider } from "../unsaved-changes/UnsavedChangesProvider";
import ArtifactWorkbench from "./ArtifactWorkbench";

function render(
  ui: Parameters<typeof testingRender>[0],
): ReturnType<typeof testingRender> & {
  router: ReturnType<typeof createMemoryRouter>;
} {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: <UnsavedChangesProvider>{ui}</UnsavedChangesProvider>,
      },
      { path: "/next", element: <h1>Next page</h1> },
    ],
    { initialEntries: ["/"] },
  );
  return {
    ...testingRender(
    <LocalizationProvider>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </LocalizationProvider>,
    ),
    router,
  };
}

vi.mock("./CodeEditor", () => ({
  default: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (value: string) => void;
  }) => (
    <textarea
      aria-label="代码编辑器"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

vi.mock("./ArtifactFixedLayoutPreview", () => ({
  ArtifactFixedLayoutPreview: ({
    fileType,
    loadBytes,
    name,
  }: {
    fileType: "pdf" | "ofd";
    loadBytes: () => Promise<Uint8Array>;
    name: string;
  }) => (
    <div
      aria-label={name}
      data-file-type={fileType}
      data-has-loader={String(Boolean(loadBytes))}
    />
  ),
}));

const markdownFile: WorkspaceFile = {
  name: "requirement.md",
  path: "docs/requirement.md",
  content: "# Requirement scope",
  kind: "markdown",
  language: "markdown",
  size: 19,
  modifiedAt: 1,
  version: "1:19",
};

const binaryFile: WorkspaceFile = {
  name: "resume.docx",
  path: "resume.docx",
  content: "",
  kind: "binary",
  language: "binary",
  size: 4096,
  modifiedAt: 1,
  version: "1:4096",
};

const pdfFile: WorkspaceFile = {
  name: "resume.pdf",
  path: "resume.pdf",
  content: "",
  kind: "fixed-layout",
  language: "binary",
  size: 120_000,
  modifiedAt: 1,
  version: "1:120000",
};

function createWorkspaceApi(
  overrides: Partial<WorkspaceApi> = {},
): WorkspaceApi {
  return {
    chooseFiles: vi.fn().mockResolvedValue(null),
    openSessionFiles: vi.fn().mockResolvedValue({
      binding: {
        requirementId: "session-files",
        rootName: "selected",
        rootPath: "/tmp/selected",
      },
      files: [],
    }),
    chooseFolder: vi.fn().mockResolvedValue(null),
    chooseDirectory: vi.fn().mockResolvedValue({
      requirementId: "requirement-1",
      rootName: "project",
      rootPath: "/tmp/project",
    }),
    getBinding: vi.fn().mockResolvedValue({
      requirementId: "requirement-1",
      rootName: "project",
      rootPath: "/tmp/project",
    }),
    listDirectory: vi
      .fn()
      .mockResolvedValue([{ name: "docs", path: "docs", type: "directory" }]),
    readFile: vi.fn().mockResolvedValue(markdownFile),
    writeFile: vi.fn().mockImplementation(async (input) => ({
      ...markdownFile,
      content: input.content,
      version: "2:20",
    })),
    readManifest: vi.fn().mockResolvedValue({
      version: 1,
      requirementId: "requirement-1",
      stages: {},
    }),
    writeManifest: vi
      .fn()
      .mockImplementation(async (_id, manifest) => manifest),
    getPreviewUrl: vi
      .fn()
      .mockResolvedValue(
        "realmflow-artifact://preview/requirement-1/docs/requirement.md",
      ),
    readPreviewBytes: vi
      .fn()
      .mockResolvedValue(new Uint8Array([0x50, 0x4b, 0x03, 0x04])),
    showItem: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("ArtifactWorkbench", () => {
  it("uses shared document tabs and toolbar for open files", async () => {
    const api = createWorkspaceApi({
      listDirectory: vi.fn().mockResolvedValue([
        {
          name: "requirement.md",
          path: "docs/requirement.md",
          type: "file",
        },
      ]),
    });
    const { container } = render(
      <ArtifactWorkbench
        activeStage="analysis"
        requirementId="requirement-1"
        workspaceApi={api}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "打开 requirement.md" }),
    );

    await screen.findByRole("tab", { name: "requirement.md" });
    expect(container.querySelector(".ui-document-tabs")).not.toBeNull();
    expect(container.querySelector(".artifact-editor-toolbar.ui-toolbar")).not.toBeNull();
  });

  it("binds a local directory and loads its root entries", async () => {
    const api = createWorkspaceApi({
      getBinding: vi.fn().mockResolvedValue(null),
      listDirectory: vi
        .fn()
        .mockResolvedValue([
          { name: "README.md", path: "README.md", type: "file" },
        ]),
    });
    render(
      <ArtifactWorkbench
        activeStage="analysis"
        requirementId="requirement-1"
        workspaceApi={api}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "绑定本地目录" }),
    );

    expect(await screen.findByText("project")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "打开 README.md" }),
    ).toBeInTheDocument();
  });

  it("opens Markdown in preview mode and can switch to editing", async () => {
    const api = createWorkspaceApi({
      listDirectory: vi.fn().mockResolvedValue([
        {
          name: "requirement.md",
          path: "docs/requirement.md",
          type: "file",
        },
      ]),
    });
    render(
      <ArtifactWorkbench
        activeStage="analysis"
        requirementId="requirement-1"
        workspaceApi={api}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "打开 requirement.md" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Requirement scope" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "编辑文件" }));
    expect(
      await screen.findByRole("textbox", { name: "代码编辑器" }),
    ).toHaveValue("# Requirement scope");
  });

  it("opens binary documents as read-only files with a Finder fallback", async () => {
    const showItem = vi.fn().mockResolvedValue(undefined);
    const api = createWorkspaceApi({
      showItem,
      listDirectory: vi.fn().mockResolvedValue([
        {
          name: "resume.docx",
          path: "resume.docx",
          type: "file",
        },
      ]),
      readFile: vi.fn().mockResolvedValue(binaryFile),
    });
    render(
      <ArtifactWorkbench
        requirementId="requirement-1"
        workspaceApi={api}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "打开 resume.docx" }),
    );

    expect(await screen.findByText("resume.docx")).toBeInTheDocument();
    expect(
      screen.getByText("此文件不能在 RealmFlow 内直接预览，可在 Finder 中打开。"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "保存文件" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "在 Finder 中显示" }));
    expect(showItem).toHaveBeenCalledWith("requirement-1", "resume.docx");
  });

  it("previews session artifacts even when no requirement directory is bound", async () => {
    const api = createWorkspaceApi({
      getBinding: vi.fn().mockResolvedValue(null),
    });
    render(
      <ArtifactWorkbench
        initialFiles={[pdfFile]}
        requirementId="session-files"
        workspaceApi={api}
      />,
    );

    expect(await screen.findByRole("tab", { name: "resume.pdf" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(await screen.findByLabelText("resume.pdf")).toHaveAttribute(
      "data-has-loader",
      "true",
    );
    expect(screen.getByLabelText("resume.pdf")).toHaveAttribute(
      "data-file-type",
      "pdf",
    );
    expect(
      screen.queryByRole("button", { name: "绑定本地目录" }),
    ).not.toBeInTheDocument();
  });

  it("keeps image previews contained and offers an in-place decode retry", async () => {
    const imageFile: WorkspaceFile = {
      name: "diagram.png",
      path: "assets/diagram.png",
      content: "",
      kind: "image",
      language: "binary",
      size: 3,
      modifiedAt: 1,
      version: "1:3",
    };
    const api = createWorkspaceApi({
      listDirectory: vi.fn().mockResolvedValue([
        {
          name: "diagram.png",
          path: "assets/diagram.png",
          type: "file",
        },
      ]),
      readFile: vi.fn().mockResolvedValue(imageFile),
      getPreviewUrl: vi
        .fn()
        .mockResolvedValue(
          "realmflow-artifact://preview/requirement-1/assets/diagram.png",
        ),
    });
    const { container } = render(
      <ArtifactWorkbench
        activeStage="design"
        requirementId="requirement-1"
        workspaceApi={api}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "打开 diagram.png" }),
    );

    const image = await screen.findByRole("img", { name: "diagram.png" });
    expect(image).toHaveAttribute("loading", "eager");
    expect(image).toHaveAttribute("decoding", "async");
    expect(image).toHaveAttribute("data-media-layout", "contained");
    expect(container.querySelector(".artifact-image-preview")).toBeVisible();

    fireEvent.error(image);

    expect(screen.getByRole("alert")).toHaveTextContent("无法显示图片");
    fireEvent.click(screen.getByRole("button", { name: "重试图片" }));
    expect(
      await screen.findByRole("img", { name: "diagram.png" }),
    ).toHaveAttribute(
      "src",
      "realmflow-artifact://preview/requirement-1/assets/diagram.png",
    );
  });

  it("opens OFD in read-only preview mode without edit or save controls", async () => {
    const ofdFile: WorkspaceFile = {
      name: "invoice.ofd",
      path: "docs/invoice.ofd",
      content: "",
      kind: "fixed-layout",
      language: "binary",
      size: 4,
      modifiedAt: 1,
      version: "1:4",
    };
    const api = createWorkspaceApi({
      listDirectory: vi.fn().mockResolvedValue([
        {
          name: "invoice.ofd",
          path: "docs/invoice.ofd",
          type: "file",
        },
      ]),
      readFile: vi.fn().mockResolvedValue(ofdFile),
      getPreviewUrl: vi
        .fn()
        .mockResolvedValue(
          "realmflow-artifact://preview/requirement-1/docs/invoice.ofd",
        ),
    });
    render(
      <ArtifactWorkbench
        activeStage="design"
        requirementId="requirement-1"
        workspaceApi={api}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "打开 invoice.ofd" }),
    );

    expect(await screen.findByLabelText("invoice.ofd")).toHaveAttribute(
      "data-has-loader",
      "true",
    );
    expect(screen.getByLabelText("invoice.ofd")).toHaveAttribute(
      "data-file-type",
      "ofd",
    );
    expect(api.getPreviewUrl).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "编辑文件" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "保存文件" }),
    ).not.toBeInTheDocument();
  });

  it("saves edited code with the version that was opened", async () => {
    const codeFile: WorkspaceFile = {
      ...markdownFile,
      name: "main.ts",
      path: "src/main.ts",
      content: "const ready = false",
      kind: "code",
      language: "typescript",
    };
    const api = createWorkspaceApi({
      listDirectory: vi
        .fn()
        .mockResolvedValue([
          { name: "main.ts", path: "src/main.ts", type: "file" },
        ]),
      readFile: vi.fn().mockResolvedValue(codeFile),
    });
    render(
      <ArtifactWorkbench
        activeStage="implementation"
        requirementId="requirement-1"
        workspaceApi={api}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "打开 main.ts" }),
    );
    fireEvent.change(
      await screen.findByRole("textbox", { name: "代码编辑器" }),
      {
        target: { value: "const ready = true" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "保存文件" }));

    await waitFor(() => {
      expect(api.writeFile).toHaveBeenCalledWith({
        requirementId: "requirement-1",
        path: "src/main.ts",
        content: "const ready = true",
        expectedVersion: "1:19",
      });
    });
  });

  it("keeps or discards a dirty document before closing its tab", async () => {
    const codeFile: WorkspaceFile = {
      ...markdownFile,
      name: "main.ts",
      path: "src/main.ts",
      content: "const ready = false",
      kind: "code",
      language: "typescript",
    };
    const api = createWorkspaceApi();
    render(
      <ArtifactWorkbench
        initialFiles={[codeFile]}
        requirementId="requirement-1"
        workspaceApi={api}
      />,
    );
    fireEvent.change(
      await screen.findByRole("textbox", { name: "代码编辑器" }),
      { target: { value: "const ready = true" } },
    );

    fireEvent.click(screen.getByRole("button", { name: "关闭 main.ts" }));
    fireEvent.click(screen.getByRole("button", { name: "留在当前页" }));
    expect(screen.getByRole("tab", { name: "main.ts" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "关闭 main.ts" }));
    fireEvent.click(screen.getByRole("button", { name: "放弃更改" }));
    expect(screen.queryByRole("tab", { name: "main.ts" })).toBeNull();
    expect(api.writeFile).not.toHaveBeenCalled();
  });

  it("saves a dirty document before closing its tab", async () => {
    const codeFile: WorkspaceFile = {
      ...markdownFile,
      name: "main.ts",
      path: "src/main.ts",
      content: "const ready = false",
      kind: "code",
      language: "typescript",
    };
    const api = createWorkspaceApi();
    render(
      <ArtifactWorkbench
        initialFiles={[codeFile]}
        requirementId="requirement-1"
        workspaceApi={api}
      />,
    );
    fireEvent.change(
      await screen.findByRole("textbox", { name: "代码编辑器" }),
      { target: { value: "const ready = true" } },
    );

    fireEvent.click(screen.getByRole("button", { name: "关闭 main.ts" }));
    fireEvent.click(screen.getByRole("button", { name: "保存并继续" }));

    await waitFor(() => expect(api.writeFile).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("tab", { name: "main.ts" })).toBeNull();
  });

  it("keeps a dirty tab open when save-before-close fails", async () => {
    const codeFile: WorkspaceFile = {
      ...markdownFile,
      name: "main.ts",
      path: "src/main.ts",
      content: "const ready = false",
      kind: "code",
      language: "typescript",
    };
    const api = createWorkspaceApi({
      writeFile: vi.fn().mockRejectedValue(new Error("write failed")),
    });
    render(
      <ArtifactWorkbench
        initialFiles={[codeFile]}
        requirementId="requirement-1"
        workspaceApi={api}
      />,
    );
    fireEvent.change(
      await screen.findByRole("textbox", { name: "代码编辑器" }),
      { target: { value: "const ready = true" } },
    );

    fireEvent.click(screen.getByRole("button", { name: "关闭 main.ts" }));
    fireEvent.click(screen.getByRole("button", { name: "保存并继续" }));

    const dialog = screen.getByRole("dialog", { name: "未保存的更改" });
    await waitFor(() =>
      expect(within(dialog).getByRole("alert")).toHaveTextContent(
        "无法保存更改，请重试或选择其他操作",
      ),
    );
    expect(screen.getByRole("tab", { name: "main.ts" })).toBeVisible();
  });

  it("protects dirty documents before closing the artifact pane", async () => {
    const codeFile: WorkspaceFile = {
      ...markdownFile,
      name: "main.ts",
      path: "src/main.ts",
      content: "const ready = false",
      kind: "code",
      language: "typescript",
    };
    const onClose = vi.fn();
    render(
      <ArtifactWorkbench
        initialFiles={[codeFile]}
        requirementId="requirement-1"
        workspaceApi={createWorkspaceApi()}
        onClose={onClose}
      />,
    );
    fireEvent.change(
      await screen.findByRole("textbox", { name: "代码编辑器" }),
      { target: { value: "const ready = true" } },
    );

    fireEvent.click(
      screen.getByRole("button", { name: "关闭产物工作区" }),
    );
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "放弃更改" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("associates the active file as the primary artifact of the current stage", async () => {
    const api = createWorkspaceApi({
      listDirectory: vi.fn().mockResolvedValue([
        {
          name: "requirement.md",
          path: "docs/requirement.md",
          type: "file",
        },
      ]),
    });
    render(
      <ArtifactWorkbench
        activeStage="analysis"
        requirementId="requirement-1"
        workspaceApi={api}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "打开 requirement.md" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "关联到需求分析" }),
    );

    await waitFor(() => {
      expect(api.writeManifest).toHaveBeenCalledWith("requirement-1", {
        version: 1,
        requirementId: "requirement-1",
        stages: {
          analysis: {
            artifacts: [{ path: "docs/requirement.md", primary: true }],
          },
        },
      });
    });
  });

  it("does not steal focus after opening another file beside the stage artifact", async () => {
    const codeFile: WorkspaceFile = {
      ...markdownFile,
      name: "main.ts",
      path: "src/main.ts",
      content: "export const ready = true",
      kind: "code",
      language: "typescript",
    };
    const api = createWorkspaceApi({
      listDirectory: vi.fn().mockResolvedValue([
        {
          name: "requirement.md",
          path: "docs/requirement.md",
          type: "file",
        },
        { name: "main.ts", path: "src/main.ts", type: "file" },
      ]),
      readFile: vi
        .fn()
        .mockImplementation(async (_requirementId, path) =>
          path === "src/main.ts" ? codeFile : markdownFile,
        ),
      readManifest: vi.fn().mockResolvedValue({
        version: 1,
        requirementId: "requirement-1",
        stages: {
          analysis: {
            artifacts: [{ path: "docs/requirement.md", primary: true }],
          },
        },
      }),
    });
    render(
      <ArtifactWorkbench
        activeStage="analysis"
        requirementId="requirement-1"
        workspaceApi={api}
      />,
    );

    await screen.findByRole("heading", { name: "Requirement scope" });
    fireEvent.click(screen.getByRole("button", { name: "打开 main.ts" }));

    expect(await screen.findByRole("tab", { name: "main.ts" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("shows a stable toast when opening a file fails", async () => {
    const secretError = "cannot read /Users/alice/private/token.txt";
    const api = createWorkspaceApi({
      listDirectory: vi.fn().mockResolvedValue([
        {
          name: "requirement.md",
          path: "docs/requirement.md",
          type: "file",
        },
      ]),
      readFile: vi.fn().mockRejectedValue(new Error(secretError)),
    });
    render(
      <ArtifactWorkbench
        requirementId="requirement-1"
        workspaceApi={api}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "打开 requirement.md" }),
    );

    expect(await screen.findByText("无法打开文件")).toBeInTheDocument();
    expect(screen.queryByText(secretError)).not.toBeInTheDocument();
  });

  it("shows a stable toast when binding a directory fails", async () => {
    const secretError = "credential=workspace-secret";
    const api = createWorkspaceApi({
      getBinding: vi.fn().mockResolvedValue(null),
      chooseDirectory: vi.fn().mockRejectedValue(new Error(secretError)),
    });
    render(
      <ArtifactWorkbench
        requirementId="requirement-1"
        workspaceApi={api}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "绑定本地目录" }),
    );

    expect(await screen.findByText("无法绑定本地目录")).toBeInTheDocument();
    expect(screen.queryByText(secretError)).not.toBeInTheDocument();
  });

  it("shows a stable toast when expanding a directory fails", async () => {
    const secretError = "cannot list /Volumes/private/project";
    const api = createWorkspaceApi({
      listDirectory: vi
        .fn()
        .mockResolvedValueOnce([
          { name: "docs", path: "docs", type: "directory" },
        ])
        .mockRejectedValueOnce(new Error(secretError)),
    });
    render(
      <ArtifactWorkbench
        requirementId="requirement-1"
        workspaceApi={api}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "展开 docs" }),
    );

    expect(await screen.findByText("无法展开目录")).toBeInTheDocument();
    expect(screen.queryByText(secretError)).not.toBeInTheDocument();
  });

  it("shows a stable toast when saving a file fails", async () => {
    const secretError = "write failed for /Users/alice/project/src/main.ts";
    const codeFile: WorkspaceFile = {
      ...markdownFile,
      name: "main.ts",
      path: "src/main.ts",
      content: "const ready = false",
      kind: "code",
      language: "typescript",
    };
    const api = createWorkspaceApi({
      writeFile: vi.fn().mockRejectedValue(new Error(secretError)),
    });
    render(
      <ArtifactWorkbench
        initialFiles={[codeFile]}
        requirementId="requirement-1"
        workspaceApi={api}
      />,
    );

    fireEvent.change(
      await screen.findByRole("textbox", { name: "代码编辑器" }),
      {
        target: { value: "const ready = true" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "保存文件" }));

    expect(await screen.findByText("无法保存文件")).toBeInTheDocument();
    expect(screen.queryByText(secretError)).not.toBeInTheDocument();
  });

  it("shows a stable toast when associating a stage artifact fails", async () => {
    const secretError = "manifest write exposed credential=secret";
    const api = createWorkspaceApi({
      writeManifest: vi.fn().mockRejectedValue(new Error(secretError)),
    });
    render(
      <ArtifactWorkbench
        activeStage="analysis"
        initialFiles={[markdownFile]}
        requirementId="requirement-1"
        workspaceApi={api}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "关联到需求分析" }),
    );

    expect(await screen.findByText("无法关联阶段产物")).toBeInTheDocument();
    expect(screen.queryByText(secretError)).not.toBeInTheDocument();
  });

  it("keeps initial loading failures inline without exposing error details", async () => {
    const secretError = "failed to load /Users/alice/private/project";
    const api = createWorkspaceApi({
      getBinding: vi.fn().mockRejectedValue(new Error(secretError)),
    });
    render(
      <ArtifactWorkbench
        requirementId="requirement-1"
        workspaceApi={api}
      />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "无法加载工作目录",
    );
    expect(screen.queryByText(secretError)).not.toBeInTheDocument();
  });
});
