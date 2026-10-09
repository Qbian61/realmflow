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
};

describe("KnowledgeResourceRow", () => {
  it("labels resource state separately from index availability and opens the latest job", () => {
    const onViewLatestIndexJob = vi.fn();
    render(
      <LocalizationProvider>
        <div role="table">
          <KnowledgeResourceRow
            resource={resource}
            onOpen={vi.fn(async () => undefined)}
            onSync={vi.fn(async () => undefined)}
            onIndex={vi.fn(async () => undefined)}
            onViewLatestIndexJob={onViewLatestIndexJob}
            onRefreshPolicyChange={vi.fn(async () => undefined)}
            onRemove={vi.fn(async () => undefined)}
          />
        </div>
      </LocalizationProvider>,
    );

    expect(screen.getByText("本地仓库")).toBeInTheDocument();
    expect(screen.getByLabelText("资源状态：已索引")).toHaveClass(
      "ui-badge",
      "ui-badge--success",
    );
    expect(screen.getByLabelText("索引可用性：索引失败")).toHaveClass(
      "ui-badge",
      "ui-badge--danger",
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "查看 developers-server 的最近索引任务",
      }),
    );
    expect(
      screen.getByRole("button", {
        name: "查看 developers-server 的最近索引任务",
      }),
    ).toHaveClass(
      "ui-icon-button",
      "ui-button--compact",
      "ui-button--ghost",
    );
    expect(onViewLatestIndexJob).toHaveBeenCalledWith(resource);
    expect(screen.getByText(resource.locator)).toHaveAttribute(
      "title",
      resource.locator,
    );
  });
});
