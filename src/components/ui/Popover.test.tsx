import { useRef, useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { Popover, PopoverContent } from "./Popover";

function PopoverHarness(): JSX.Element {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
      >
        Filters
      </button>
      <Popover
        open={open}
        trigger={triggerRef.current}
        onOpenChange={setOpen}
      >
        <PopoverContent aria-label="Filter options">
          <input data-autofocus aria-label="Search" />
        </PopoverContent>
      </Popover>
    </>
  );
}

describe("Popover", () => {
  it("portals outside clipping containers and restores trigger focus", () => {
    render(<PopoverHarness />);
    const trigger = screen.getByRole("button", { name: "Filters" });
    trigger.focus();
    fireEvent.click(trigger);

    const popover = screen.getByRole("dialog", { name: "Filter options" });
    expect(popover.parentElement).toBe(document.body);
    expect(popover).toHaveClass("ui-popover");
    expect(screen.getByRole("textbox", { name: "Search" })).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(
      screen.queryByRole("dialog", { name: "Filter options" }),
    ).toBeNull();
    expect(trigger).toHaveFocus();
  });
});
