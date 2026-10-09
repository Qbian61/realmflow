import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import type { BusinessApi, KnowledgeNoteDto } from "../../../shared/business";
import { LocalizationProvider } from "../../localization/LocalizationProvider";
import { ToastProvider } from "../toast/ToastProvider";
import { KnowledgeNotesPanel } from "./KnowledgeNotesPanel";

const note: KnowledgeNoteDto = {
  id: "note-1",
  workspaceId: "space-1",
  kind: "decision",
  title: "Use local storage",
  content: "Keep workspace data on this device.",
  sourceMessageIds: ["message-1"],
  version: 1,
  checksum: "checksum-1",
  status: "active",
  revision: 2,
  createdAt: 1,
  updatedAt: 2,
};

describe("KnowledgeNotesPanel", () => {
  it("uses compact shared icon buttons for note actions", async () => {
    const business = {
      listKnowledgeNotes: vi.fn().mockResolvedValue([note]),
    } as unknown as BusinessApi;
    renderPanel(business);

    for (const name of [
      "编辑 Use local storage",
      "归档 Use local storage",
    ]) {
      expect(await screen.findByRole("button", { name })).toHaveClass(
        "ui-icon-button",
        "ui-button--compact",
        "ui-button--ghost",
      );
    }
  });

  it("publishes a safe toast when archiving a note fails", async () => {
    const sensitiveError =
      "archive failed at /Users/alice/private-notes with token=secret";
    const business = {
      listKnowledgeNotes: vi.fn().mockResolvedValue([note]),
      archiveKnowledgeNote: vi
        .fn()
        .mockRejectedValue(new Error(sensitiveError)),
    } as unknown as BusinessApi;
    renderPanel(business);

    fireEvent.click(
      await screen.findByRole("button", { name: "归档 Use local storage" }),
    );
    const archiveDialog = screen.getByRole("dialog", { name: "归档知识笔记" });
    expect(archiveDialog).toHaveClass("ui-dialog", "ui-dialog--compact");
    expect(
      screen.getByRole("button", { name: "确认归档" }),
    ).toHaveClass("ui-button", "ui-button--danger");
    fireEvent.click(screen.getByRole("button", { name: "确认归档" }));

    expect(
      await screen.findByText("知识笔记归档失败，请重试"),
    ).toBeInTheDocument();
    expect(screen.queryByText(sensitiveError)).not.toBeInTheDocument();
    expect(document.querySelector(".knowledge-notes-error")).toBeNull();
  });

  it("publishes a safe toast when editing a note fails", async () => {
    const sensitiveError = "edit failed for https://user:pass@example.test";
    const business = {
      listKnowledgeNotes: vi.fn().mockResolvedValue([note]),
      editKnowledgeNote: vi.fn().mockRejectedValue(new Error(sensitiveError)),
    } as unknown as BusinessApi;
    renderPanel(business);

    fireEvent.click(
      await screen.findByRole("button", { name: "编辑 Use local storage" }),
    );
    const editDialog = screen.getByRole("dialog", { name: "编辑知识笔记" });
    expect(editDialog).toHaveClass("ui-dialog", "ui-dialog--default");
    expect(editDialog.querySelectorAll(".ui-field")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "保存修改" }),
    ).toHaveClass("ui-button", "ui-button--primary");
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));

    expect(
      await screen.findByText("知识笔记修改失败，请重试"),
    ).toBeInTheDocument();
    expect(screen.queryByText(sensitiveError)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "编辑知识笔记" }),
    ).toBeInTheDocument();
  });

  it("keeps list loading failures inline without exposing the exception", async () => {
    const sensitiveError = "read /Users/alice/.realmflow/notes.db failed";
    const business = {
      listKnowledgeNotes: vi
        .fn()
        .mockRejectedValue(new Error(sensitiveError)),
    } as unknown as BusinessApi;
    renderPanel(business);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveClass("ui-inline-alert", "ui-inline-alert--danger");
    expect(alert).toHaveTextContent("知识笔记加载失败，请重试");
    expect(screen.queryByText(sensitiveError)).not.toBeInTheDocument();
  });

  it("paginates more than 100 notes before creating row DOM", async () => {
    const business = {
      listKnowledgeNotes: vi.fn().mockResolvedValue(
        Array.from({ length: 150 }, (_, index) => ({
          ...note,
          id: `note-${index}`,
          title: `Note ${index + 1}`,
        })),
      ),
    } as unknown as BusinessApi;
    renderPanel(business);

    await waitFor(() => {
      expect(document.querySelectorAll(".knowledge-note-row")).toHaveLength(
        100,
      );
    });
    expect(screen.getByText("1-100 / 150")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "下一页" }));
    expect(document.querySelectorAll(".knowledge-note-row")).toHaveLength(50);
    expect(screen.getByText("101-150 / 150")).toBeInTheDocument();
  });
});

function renderPanel(business: BusinessApi): void {
  render(
    <LocalizationProvider>
      <ToastProvider>
        <KnowledgeNotesPanel workspaceId="space-1" business={business} />
      </ToastProvider>
    </LocalizationProvider>,
  );
}
