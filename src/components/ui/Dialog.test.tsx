import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "./Dialog";

function DialogHarness({
  closeOnBackdrop = true,
  locked = false,
}: {
  closeOnBackdrop?: boolean;
  locked?: boolean;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <Dialog
        open={open}
        aria-label="Rename"
        closeOnBackdrop={closeOnBackdrop}
        locked={locked}
        onOpenChange={setOpen}
      >
        <DialogHeader>Rename item</DialogHeader>
        <DialogBody>
          <input data-autofocus aria-label="Name" />
        </DialogBody>
        <DialogFooter>
          <button type="button" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button type="button">Save</button>
        </DialogFooter>
      </Dialog>
    </>
  );
}

describe("Dialog", () => {
  it("portals to body, focuses content and restores the trigger", () => {
    render(<DialogHarness />);
    const trigger = screen.getByRole("button", { name: "Open" });

    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Rename" });
    expect(dialog.parentElement?.parentElement).toBe(document.body);
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Rename" })).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("contains forward and reverse tab navigation", () => {
    render(<DialogHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    const input = screen.getByRole("textbox", { name: "Name" });
    const save = screen.getByRole("button", { name: "Save" });
    save.focus();
    fireEvent.keyDown(save, { key: "Tab" });
    expect(input).toHaveFocus();

    input.focus();
    fireEvent.keyDown(input, { key: "Tab", shiftKey: true });
    expect(save).toHaveFocus();
  });

  it("honors backdrop and locked dismissal policies", () => {
    const { rerender } = render(<DialogHarness closeOnBackdrop={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    fireEvent.mouseDown(screen.getByTestId("ui-dialog-backdrop"));
    expect(screen.getByRole("dialog", { name: "Rename" })).toBeVisible();

    rerender(<DialogHarness locked />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "Rename" })).toBeVisible();
  });

  it("keeps header and footer outside one dedicated scroll body", () => {
    render(<DialogHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    const dialog = screen.getByRole("dialog", { name: "Rename" });
    const header = dialog.querySelector(".ui-dialog__header");
    const body = dialog.querySelector(".ui-dialog__body");
    const footer = dialog.querySelector(".ui-dialog__footer");

    expect(header).not.toBeNull();
    expect(body).toHaveAttribute("data-dialog-scroll", "true");
    expect(footer).not.toBeNull();
    expect(header?.nextElementSibling).toBe(body);
    expect(body?.nextElementSibling).toBe(footer);
  });
});
