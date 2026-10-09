import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BusinessApi } from "../../../shared/business";
import { LocalizationProvider } from "../../localization/LocalizationProvider";
import { ToastProvider } from "../toast/ToastProvider";
import { SaveKnowledgeNoteDialog } from "./SaveKnowledgeNoteDialog";

describe("SaveKnowledgeNoteDialog", () => {
  it("publishes a safe Toast when saving fails", async () => {
    const business = {
      createKnowledgeNote: vi
        .fn()
        .mockRejectedValue(
          new Error("token=secret path=/Users/private/notes.md"),
        ),
    } as unknown as BusinessApi;

    render(
      <LocalizationProvider>
        <ToastProvider>
          <SaveKnowledgeNoteDialog
            business={business}
            workspaceId="workspace-1"
            sessionId="session-1"
            messages={[{ id: "message-1", content: "Decision details" }]}
            onClose={vi.fn()}
            onSaved={vi.fn()}
          />
        </ToastProvider>
      </LocalizationProvider>,
    );

    expect(screen.getByRole("dialog", { name: "沉淀为知识" })).toHaveClass(
      "ui-dialog",
    );
    expect(screen.getByRole("textbox", { name: "标题" }).closest(".ui-field"))
      .not.toBeNull();
    expect(screen.getByRole("button", { name: "保存知识" })).toHaveClass(
      "ui-button",
      "ui-button--primary",
    );
    fireEvent.change(screen.getByRole("textbox", { name: "标题" }), {
      target: { value: "Architecture decision" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存知识" }));

    expect(
      await screen.findByText("知识保存失败，请重试"),
    ).toHaveClass("toast-message__text");
    expect(screen.queryByText(/token=secret/)).not.toBeInTheDocument();
    expect(
      document.querySelector(".knowledge-note-dialog [role='alert']"),
    ).toBeNull();
  });
});
