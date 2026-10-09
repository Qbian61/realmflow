import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { X } from "lucide-react";
import { Button, IconButton } from "./Button";

describe("Button", () => {
  it("forwards native props, refs, variants and sizes", () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <Button
        ref={ref}
        variant="primary"
        size="comfortable"
        name="save"
      >
        Save
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toHaveClass(
      "ui-button",
      "ui-button--primary",
      "ui-button--comfortable",
    );
    expect(button).toHaveAttribute("name", "save");
    expect(ref.current).toBe(button);
  });

  it("exposes loading state and prevents duplicate actions", () => {
    render(<Button loading>Save</Button>);

    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveTextContent("Save");
    expect(button.querySelector(".ui-spinner")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });
});

describe("IconButton", () => {
  it("requires and exposes an accessible name", () => {
    render(
      <IconButton aria-label="Close">
        <X aria-hidden="true" />
      </IconButton>,
    );

    expect(screen.getByRole("button", { name: "Close" })).toHaveClass(
      "ui-icon-button",
    );
  });

  it("requires an accessible-name prop at compile time", () => {
    const invalidUsage = (): JSX.Element => (
      // @ts-expect-error IconButton requires an explicit accessible name.
      <IconButton>
        <X />
      </IconButton>
    );

    expect(invalidUsage).toBeTypeOf("function");
  });
});
