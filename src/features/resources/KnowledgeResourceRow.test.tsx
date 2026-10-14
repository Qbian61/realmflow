import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { LocalizationProvider } from "../../localization/LocalizationProvider";
import type { SpaceResource } from "../../domain/space-resource";
import { KnowledgeResourceRow } from "./KnowledgeResourceRow";

const resource: SpaceResource = {
  id: "repository-1",
  name: "developers-server",
  type: "repository",
  locator: "local-repository:repository-1",
  detail: "本地仓库",
  status: "indexed",
  revision: 2,
  updatedAt: 1,
  index: {
    health: "failed",
    profileId: "realmflow-vector-index-v1",
  },
  repository: {
    sourceId: "repository-1",
    workspaceId: "space-1",
    mode: "local",
    locator: "local-repository:repository-1",
    selectedBranch: "main",
    currentVersion: 1,
    revisionLabel: "main@abc123",
    fileCount: 1,
    totalBytes: 8,
    lastScannedAt: 2,
    createdAt: 1,
    updatedAt: 2,
  },
};

const resources: SpaceResource[] = [
  {
    ...resource,
    id: "file-1",
    name: "architecture.md",
    type: "file",
    locator: "/tmp/architecture.md",
    detail: "本地文件",
  },
  {
    ...resource,
    id: "document-1",
    name: "Design doc",
    type: "document",
    locator: "https://example.test/design",
    detail: "在线文档",
  },
  resource,
];

describe("KnowledgeResourceRow", () => {
  it.each(resources)(
    "uses one action to check $type updates and index",
    (currentResource) => {
      const onSync = vi.fn(async () => undefined);
      render(
        <LocalizationProvider>
          <div role="table">
            <KnowledgeResourceRow
              resource={currentResource}
              onOpen={vi.fn(async () => undefined)}
              onSync={onSync}
              onRefreshPolicyChange={vi.fn(async () => undefined)}
              onRemove={vi.fn(async () => undefined)}
            />
          </div>
        </LocalizationProvider>,
      );

      fireEvent.click(
        screen.getByRole("button", {
          name: `检查更新并索引 ${currentResource.name}`,
        }),
      );

      expect(onSync).toHaveBeenCalledWith(currentResource);
      expect(
        screen.queryByRole("button", {
          name: `刷新 ${currentResource.name}`,
        }),
      ).not.toBeInTheDocument();
    },
  );

  it("shows repository branch metadata and the current index status", () => {
    render(
      <LocalizationProvider>
        <div role="table">
          <KnowledgeResourceRow
            resource={resource}
            onOpen={vi.fn(async () => undefined)}
            onSync={vi.fn(async () => undefined)}
            onRefreshPolicyChange={vi.fn(async () => undefined)}
            onRemove={vi.fn(async () => undefined)}
          />
        </div>
      </LocalizationProvider>,
    );

    expect(screen.getByText("代码仓库")).toBeInTheDocument();
    expect(screen.getByText("main · abc123")).toBeInTheDocument();
    expect(screen.getByText("索引失败")).toBeInTheDocument();
    expect(screen.queryByText(resource.locator)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("资源状态：已索引")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "查看 developers-server 的最近索引任务",
      }),
    ).not.toBeInTheDocument();
  });

  it.each([
    ["extraction_encrypted", "文件已加密"],
    ["extraction_invalid", "格式损坏"],
    ["extraction_limit_exceeded", "超出处理限制"],
    ["extraction_ocr_failed", "OCR 失败"],
    ["extraction_converter_unavailable", "转换器不可用"],
  ])(
    "shows a safe extraction failure reason for %s",
    (errorCode, message) => {
      render(
        <LocalizationProvider>
          <div role="table">
            <KnowledgeResourceRow
              resource={{
                ...resources[0]!,
                index: {
                  health: "failed",
                  profileId: "realmflow-vector-index-v1",
                  errorCode,
                },
              }}
              onOpen={vi.fn(async () => undefined)}
              onSync={vi.fn(async () => undefined)}
              onRefreshPolicyChange={vi.fn(async () => undefined)}
              onRemove={vi.fn(async () => undefined)}
            />
          </div>
        </LocalizationProvider>,
      );

      expect(
        screen.getByLabelText(`索引可用性：索引失败；错误：${message}`),
      ).toHaveAttribute("title", `错误：${message}`);
      expect(screen.queryByText("/tmp/architecture.md")).not.toBeInTheDocument();
    },
  );

  it("uses operation-only tooltip titles for row icon actions", () => {
    render(
      <LocalizationProvider>
        <div role="table">
          <KnowledgeResourceRow
            resource={resource}
            onOpen={vi.fn(async () => undefined)}
            onSync={vi.fn(async () => undefined)}
            onRefreshPolicyChange={vi.fn(async () => undefined)}
            onRemove={vi.fn(async () => undefined)}
          />
        </div>
      </LocalizationProvider>,
    );

    expect(
      screen.getByRole("button", {
        name: "检查更新并索引 developers-server",
      }),
    ).toHaveAttribute("title", "检查更新并索引");
    expect(
      screen.getByRole("button", { name: "删除 developers-server" }),
    ).toHaveAttribute("title", "删除");
  });

  it("labels remote repositories as remote repositories", () => {
    render(
      <LocalizationProvider>
        <div role="table">
          <KnowledgeResourceRow
            resource={{
              ...resource,
              id: "repository-remote-1",
              locator: "connector:github/org/repository",
              repository: {
                ...resource.repository!,
                sourceId: "repository-remote-1",
                mode: "remote",
                locator: "connector:github/org/repository",
                selectedBranch: "release",
                revisionLabel: "release@def456",
              },
            }}
            onOpen={vi.fn(async () => undefined)}
            onSync={vi.fn(async () => undefined)}
            onRefreshPolicyChange={vi.fn(async () => undefined)}
            onRemove={vi.fn(async () => undefined)}
          />
        </div>
      </LocalizationProvider>,
    );

    expect(screen.getByText("远程仓库")).toBeInTheDocument();
    expect(screen.getByText("release · def456")).toBeInTheDocument();
  });
});
