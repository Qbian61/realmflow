import { render, screen } from "@testing-library/react";
import { Card } from "./Card";

describe("Card", () => {
  it("renders a semantic entity surface with explicit density", () => {
    render(
      <Card as="article" density="spacious" interactive>
        Schedule
      </Card>,
    );

    expect(screen.getByRole("article")).toHaveClass(
      "ui-card",
      "ui-card--spacious",
      "ui-card--interactive",
    );
  });
});
