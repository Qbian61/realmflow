import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { LocalizationProvider } from "../../localization/LocalizationProvider";
import { RecentlyDeletedDialog } from "./RecentlyDeletedDialog";

function Harness(): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <LocalizationProvider>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {open ? (
        <RecentlyDeletedDialog
          items={[{ id: "deleted-1", name: "Draft", deletedAt: 1 }]}
          loading={false}
          onClose={() => setOpen(false)}
          onRestore={vi.fn()}
        />
      ) : null}
    </LocalizationProvider>
  );
}

describe("RecentlyDeletedDialog", () => {
  it("uses the shared dialog shell and restores focus after Escape", () => {
    render(<Harness />);

    const trigger = screen.getByRole("button", { name: "Open" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "最近删除" });
    expect(dialog).toHaveClass("ui-dialog", "ui-dialog--compact");
    const close = screen.getByRole("button", { name: "关闭" });
    expect(close).toHaveClass("ui-icon-button");
    expect(close).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
