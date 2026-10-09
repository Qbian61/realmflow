import { fireEvent, render, screen } from "@testing-library/react";
import { LocalizationProvider } from "../../localization/LocalizationProvider";
import { DragHandle } from "./DragHandle";

function renderHandle(
  overrides: Partial<React.ComponentProps<typeof DragHandle>> = {},
): HTMLElement {
  render(
    <LocalizationProvider>
      <DragHandle name="终端" {...overrides} />
    </LocalizationProvider>,
  );
  return screen.getByLabelText("拖拽排序 终端");
}

describe("DragHandle", () => {
  it("renders a non-button drag-only handle", () => {
    const handle = renderHandle();

    expect(handle.tagName).toBe("SPAN");
    expect(handle).toHaveClass("reorder-drag-handle");
    expect(handle).toHaveAttribute("draggable", "true");
    expect(handle).toHaveAttribute("title", "拖拽排序");
    expect(handle).not.toHaveAttribute("aria-haspopup");
    expect(handle).not.toHaveAttribute("aria-expanded");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("does not open a menu when clicked", () => {
    const handle = renderHandle();

    fireEvent.click(handle);

    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("disables dragging without exposing button semantics", () => {
    const handle = renderHandle({ disabled: true });

    expect(handle).toHaveAttribute("draggable", "false");
    expect(handle).toHaveAttribute("aria-disabled", "true");
  });
});
