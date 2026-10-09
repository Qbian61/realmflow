import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RequirementExecutionArtifactDto } from "../../../shared/business";
import { LocalizationProvider } from "../../localization/LocalizationProvider";
import { NodeArtifactPanel } from "./NodeArtifactPanel";

const artifacts: RequirementExecutionArtifactDto[] = [
  {
    id: "artifact-1",
    nodeId: "implementation",
    relativePath: "artifacts/releases/implementation-notes.md",
    kind: "markdown",
    version: 3,
    byteSize: 2_048,
    isPrimary: true,
    updatedAt: Date.UTC(2026, 8, 30, 12, 34, 56),
  },
];

describe("NodeArtifactPanel", () => {
  it("shows complete artifact metadata without a redundant visible header", () => {
    renderPanel();

    expect(
      screen.getByRole("region", { name: "Implementation Formal artifacts" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Implementation" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Formal artifacts")).not.toBeInTheDocument();

    const row = screen.getByRole("listitem");
    expect(within(row).getByText("implementation-notes.md")).toBeVisible();
    expect(
      within(row).getByText("artifacts/releases/implementation-notes.md"),
    ).toBeVisible();
    expect(within(row).getByText("markdown")).toBeVisible();
    expect(within(row).getByText("3")).toBeVisible();
    expect(within(row).getByText("2 KB")).toBeVisible();
    expect(within(row).getByText(/2026/)).toBeVisible();
  });

  it("opens the exact relative path with the file name as its label", () => {
    const onOpenArtifact = vi.fn();
    renderPanel({ onOpenArtifact });

    fireEvent.click(
      screen.getByRole("button", { name: "Open implementation-notes.md" }),
    );

    expect(onOpenArtifact).toHaveBeenCalledOnce();
    expect(onOpenArtifact).toHaveBeenCalledWith(
      "artifacts/releases/implementation-notes.md",
      "implementation-notes.md",
    );
  });

  it("exposes a long relative path as a native tooltip", () => {
    renderPanel();

    expect(
      screen.getByText("artifacts/releases/implementation-notes.md"),
    ).toHaveAttribute(
      "title",
      "artifacts/releases/implementation-notes.md",
    );
  });

  it("renders the localized empty state without an artifact list", () => {
    renderPanel({ artifacts: [] });

    expect(screen.getByText("No formal artifacts")).toHaveClass(
      "node-workbench-empty-state",
    );
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("allows callers to supply labels without changing localization catalogs", () => {
    renderPanel({
      labels: {
        title: "Deliverables",
        empty: "Nothing delivered",
        open: "Inspect",
      },
    });

    expect(
      screen.getByRole("region", { name: "Implementation Deliverables" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Inspect implementation-notes.md" }),
    ).toBeVisible();
  });
});

function renderPanel(
  overrides: Partial<React.ComponentProps<typeof NodeArtifactPanel>> = {},
): void {
  const storage = {
    getItem: vi.fn(() => JSON.stringify({ version: 1, locale: "en" })),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    key: vi.fn(),
    length: 0,
  } satisfies Storage;

  render(
    <LocalizationProvider storage={storage}>
      <NodeArtifactPanel
        nodeName="Implementation"
        artifacts={artifacts}
        onOpenArtifact={vi.fn()}
        {...overrides}
      />
    </LocalizationProvider>,
  );
}
