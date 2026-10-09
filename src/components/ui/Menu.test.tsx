import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuRadioItem,
  MenuSeparator,
} from "./Menu";

function MenuHarness(): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open menu
      </button>
      <Menu open={open} onOpenChange={setOpen}>
        <MenuContent aria-label="Actions">
          <MenuItem onSelect={() => undefined}>Rename</MenuItem>
          <MenuItem disabled onSelect={() => undefined}>
            Move
          </MenuItem>
          <MenuSeparator />
          <MenuItem variant="danger" onSelect={() => undefined}>
            Delete
          </MenuItem>
        </MenuContent>
      </Menu>
    </>
  );
}

describe("Menu", () => {
  it("moves focus with arrow keys and skips disabled items", () => {
    render(<MenuHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));

    const rename = screen.getByRole("menuitem", { name: "Rename" });
    const remove = screen.getByRole("menuitem", { name: "Delete" });
    expect(rename).toHaveFocus();
    fireEvent.keyDown(rename, { key: "ArrowDown" });
    expect(remove).toHaveFocus();
    fireEvent.keyDown(remove, { key: "Home" });
    expect(rename).toHaveFocus();
  });

  it("closes on selection, Escape and outside pointer input", () => {
    const { rerender } = render(<MenuHarness />);
    const trigger = screen.getByRole("button", { name: "Open menu" });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();

    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();

    rerender(<MenuHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("can preserve initial focus for menus with an embedded search field", () => {
    render(
      <Menu open onOpenChange={() => undefined} autoFocusItems={false}>
        <MenuContent aria-label="Search actions">
          <input aria-label="Search" autoFocus type="search" />
          <MenuItem onSelect={() => undefined}>Open</MenuItem>
        </MenuContent>
      </Menu>,
    );

    expect(screen.getByRole("searchbox", { name: "Search" })).toHaveFocus();
  });

  it("navigates menu radio items with the shared keyboard behavior", () => {
    render(
      <Menu open onOpenChange={() => undefined}>
        <MenuContent aria-label="Theme">
          <button type="button" role="menuitemradio" aria-checked="true">
            System
          </button>
          <button type="button" role="menuitemradio" aria-checked="false">
            Dark
          </button>
        </MenuContent>
      </Menu>,
    );

    const system = screen.getByRole("menuitemradio", { name: "System" });
    const dark = screen.getByRole("menuitemradio", { name: "Dark" });
    expect(system).toHaveFocus();
    fireEvent.keyDown(system, { key: "ArrowDown" });
    expect(dark).toHaveFocus();
  });

  it("closes shared radio items on selection and restores trigger focus", () => {
    const onSelect = vi.fn();
    function RadioHarness(): JSX.Element {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Filter
          </button>
          <Menu open={open} onOpenChange={setOpen}>
            <MenuContent aria-label="Filters">
              <MenuRadioItem checked onSelect={onSelect}>
                All
              </MenuRadioItem>
            </MenuContent>
          </Menu>
        </>
      );
    }

    render(<RadioHarness />);
    const trigger = screen.getByRole("button", { name: "Filter" });
    trigger.focus();
    fireEvent.click(trigger);
    const item = screen.getByRole("menuitemradio", { name: "All" });
    expect(item).toHaveClass("ui-menu-item");
    expect(item).toHaveAttribute("aria-checked", "true");
    fireEvent.click(item);
    expect(onSelect).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
