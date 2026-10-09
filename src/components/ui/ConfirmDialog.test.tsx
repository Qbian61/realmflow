import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  it("focuses cancel instead of the destructive action", () => {
    render(
      <ConfirmDialog
        open
        title="Delete schedule"
        description="This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Delete" })).toHaveClass(
      "ui-button--danger",
    );
  });

  it("locks dismissal and duplicate submission while pending", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Publish template"
        description="Publish this immutable version."
        confirmLabel="Publish"
        cancelLabel="Cancel"
        variant="primary"
        pending
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    fireEvent.keyDown(document, { key: "Escape" });

    expect(onCancel).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Publish" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });

  it("keeps an accessible command error inside the dialog", () => {
    render(
      <ConfirmDialog
        open
        title="Delete edge"
        description="Delete the selected edge."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        error="Unable to delete the edge."
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Unable to delete the edge.",
    );
  });
});
