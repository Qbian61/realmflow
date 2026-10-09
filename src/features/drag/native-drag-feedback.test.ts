import {
  beginNativeDrag,
  finishNativeDrag,
} from "./native-drag-feedback";

describe("native drag feedback", () => {
  afterEach(() => {
    finishNativeDrag();
    document.body.replaceChildren();
  });

  it("cleans the drag source and ghost when Escape cancels dragging", () => {
    const source = document.createElement("div");
    document.body.appendChild(source);
    const event = {
      dataTransfer: {
        setDragImage: vi.fn(),
      },
    } as unknown as React.DragEvent<HTMLElement>;

    beginNativeDrag(event, source);
    expect(source).toHaveAttribute("data-dragging", "true");
    expect(document.querySelector(".app-drag-ghost")).toBeInTheDocument();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(source).not.toHaveAttribute("data-dragging");
    expect(document.querySelector(".app-drag-ghost")).toBeNull();
  });
});
