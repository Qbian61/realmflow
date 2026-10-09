import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { LocalizationProvider } from "../../localization/LocalizationProvider";
import { OnlineDocumentSnapshotDialog } from "./OnlineDocumentSnapshotDialog";

describe("OnlineDocumentSnapshotDialog", () => {
  it("keeps document content inside the shared dialog scroll body", () => {
    render(
      <LocalizationProvider>
        <OnlineDocumentSnapshotDialog
          name="Architecture notes"
          view={{
            document: {
              sourceId: "source-1",
              workspaceId: "space-1",
              connectorId: "connector-1",
              path: "/docs/architecture.md",
              locator: "https://docs.example.test/architecture",
              createdAt: 1,
              updatedAt: 2,
            },
            snapshot: {
              id: "snapshot-1",
              sourceId: "source-1",
              version: 3,
              mediaType: "text/markdown",
              byteSize: 24,
              content: "# Architecture\nLocal first.",
              contentChecksum: "sha256:document",
              fetchedAt: 3,
            },
          }}
          onClose={vi.fn()}
        />
      </LocalizationProvider>,
    );

    const dialog = screen.getByRole("dialog", { name: "Architecture notes" });
    const scrollBody = dialog.querySelector('[data-dialog-scroll="true"]');

    expect(dialog).toHaveClass("ui-dialog", "ui-dialog--wide");
    expect(scrollBody).toHaveClass("ui-dialog__body");
    expect(scrollBody).toContainElement(
      screen.getByText(/# Architecture/),
    );
    expect(dialog.querySelectorAll('[data-dialog-scroll="true"]')).toHaveLength(
      1,
    );
  });
});
