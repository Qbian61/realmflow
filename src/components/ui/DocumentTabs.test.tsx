import { fireEvent, render, screen } from "@testing-library/react";
import { DocumentTabs } from "./DocumentTabs";

describe("DocumentTabs", () => {
  it("supports roving focus, activation and close actions", () => {
    const onValueChange = vi.fn();
    const onClose = vi.fn();
    render(
      <DocumentTabs
        aria-label="Open files"
        value="one"
        items={[
          { value: "one", label: "One.ts", dirty: true },
          { value: "two", label: "Two.ts", closable: true },
        ]}
        onValueChange={onValueChange}
        onClose={onClose}
      />,
    );

    const first = screen.getByRole("tab", { name: /One.ts/ });
    const second = screen.getByRole("tab", { name: /Two.ts/ });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(second).toHaveFocus();
    fireEvent.keyDown(second, { key: "Enter" });
    expect(onValueChange).toHaveBeenCalledWith("two");

    fireEvent.click(screen.getByRole("button", { name: "Close Two.ts" }));
    expect(onClose).toHaveBeenCalledWith("two");
    expect(onValueChange).toHaveBeenCalledTimes(1);
  });

  it("keeps loading and toolbar content outside the tab navigation model", () => {
    const onValueChange = vi.fn();
    const { container } = render(
      <DocumentTabs
        aria-label="Open workbench tabs"
        value="web"
        items={[
          {
            value: "web",
            label: "A very long web page title",
            leading: <span data-testid="web-icon" />,
            loading: true,
            closable: true,
          },
          {
            value: "code",
            label: "Code",
            leading: <span data-testid="code-icon" />,
            closable: true,
          },
        ]}
        onValueChange={onValueChange}
        onClose={vi.fn()}
        toolbar={<button type="button">Add tab</button>}
      />,
    );

    const tabList = screen.getByRole("tablist", {
      name: "Open workbench tabs",
    });
    const webTab = screen.getByRole("tab", {
      name: "A very long web page title",
    });
    const codeTab = screen.getByRole("tab", { name: "Code" });
    const leading = container.querySelector(
      ".ui-document-tab__leading",
    );

    expect(leading).not.toBeNull();
    expect(leading).toHaveAttribute("aria-hidden", "true");
    expect(leading?.querySelector(".ui-document-tab__loading")).not.toBeNull();
    expect(screen.queryByTestId("web-icon")).toBeNull();
    expect(screen.getByTestId("code-icon")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add tab" })).not.toBe(
      tabList,
    );
    expect(screen.getByRole("button", { name: "Add tab" }).closest(
      '[role="tablist"]',
    )).toBeNull();

    codeTab.focus();
    fireEvent.keyDown(codeTab, { key: "Home" });
    expect(webTab).toHaveFocus();
    fireEvent.keyDown(webTab, { key: "End" });
    expect(codeTab).toHaveFocus();
    expect(onValueChange).not.toHaveBeenCalled();
  });
});
