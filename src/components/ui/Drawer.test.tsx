import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  Drawer,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
} from "./Drawer";

function DrawerHarness(): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open details
      </button>
      <Drawer
        open={open}
        aria-label="Task details"
        onOpenChange={setOpen}
      >
        <DrawerHeader>Task details</DrawerHeader>
        <DrawerBody>
          <input data-autofocus aria-label="Title" />
        </DrawerBody>
        <DrawerFooter>
          <button type="button">Save</button>
        </DrawerFooter>
      </Drawer>
    </>
  );
}

describe("Drawer", () => {
  it("uses the shared overlay behavior with a dedicated scroll body", () => {
    render(<DrawerHarness />);
    const trigger = screen.getByRole("button", { name: "Open details" });
    trigger.focus();
    fireEvent.click(trigger);

    const drawer = screen.getByRole("dialog", { name: "Task details" });
    expect(drawer.parentElement).toHaveClass(
      "ui-dialog-backdrop",
      "ui-drawer-backdrop",
    );
    expect(drawer).toHaveClass("ui-drawer", "ui-drawer--default");
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveFocus();
    expect(drawer.querySelector(".ui-drawer__body")).toHaveAttribute(
      "data-dialog-scroll",
      "true",
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Task details" })).toBeNull();
    expect(trigger).toHaveFocus();
  });
});
