import { fireEvent, render, screen } from "@testing-library/react";
import { Badge } from "./Badge";
import { EmptyState } from "./EmptyState";
import { InlineAlert } from "./InlineAlert";
import { Metric } from "./Metric";

describe("status and data display primitives", () => {
  it("uses semantic tones without hiding status text", () => {
    render(<Badge tone="success">Available</Badge>);
    expect(screen.getByText("Available")).toHaveClass(
      "ui-badge",
      "ui-badge--success",
    );
  });

  it("offers an accessible retry action for inline errors", () => {
    const onRetry = vi.fn();
    render(
      <InlineAlert
        tone="danger"
        title="Could not load"
        actionLabel="Retry"
        onAction={onRetry}
      >
        Local storage is unavailable.
      </InlineAlert>,
    );

    expect(screen.getByRole("alert")).toHaveClass(
      "ui-inline-alert",
      "ui-inline-alert--danger",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("locks an asynchronous alert action while it is pending", () => {
    render(
      <InlineAlert
        tone="danger"
        title="Could not load"
        actionLabel="Retry"
        actionLoading
        onAction={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Retry" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Retry" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });

  it("renders empty and metric states with stable hierarchy", () => {
    render(
      <>
        <EmptyState title="No runs" description="Run the workflow first." />
        <Metric label="Completed" value="24" detail="+3 today" />
      </>,
    );

    expect(screen.getByText("No runs").closest(".ui-empty-state")).not.toBeNull();
    expect(screen.getByText("24").closest(".ui-metric")).not.toBeNull();
  });
});
