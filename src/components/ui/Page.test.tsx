import { render, screen } from "@testing-library/react";
import {
  PageBody,
  PageContainer,
  PageHeader,
  PageShell,
} from "./Page";
import { Toolbar } from "./Toolbar";

describe("page layout primitives", () => {
  it("defines one page scroll owner and explicit content modes", () => {
    render(
      <PageShell aria-label="Settings">
        <PageHeader>
          <h1>Settings</h1>
          <Toolbar aria-label="Settings actions">
            <button type="button">Save</button>
          </Toolbar>
        </PageHeader>
        <PageBody mode="contained">
          <PageContainer>Content</PageContainer>
        </PageBody>
      </PageShell>,
    );

    expect(screen.getByRole("region", { name: "Settings" })).toHaveClass(
      "ui-page",
    );
    expect(screen.getByText("Content").closest(".ui-page__body")).toHaveClass(
      "ui-page__body",
      "ui-page__body--contained",
    );
    expect(screen.getByText("Content")).toHaveClass("ui-page__container");
    expect(
      screen.getByRole("toolbar", { name: "Settings actions" }),
    ).toHaveClass("ui-toolbar");
  });

  it("marks workspace header toolbars with the shared layout variant", () => {
    render(
      <Toolbar variant="workspace-header" aria-label="Workspace actions">
        <button type="button">Create</button>
      </Toolbar>,
    );

    expect(
      screen.getByRole("toolbar", { name: "Workspace actions" }),
    ).toHaveClass("ui-toolbar", "ui-toolbar--workspace-header");
  });

  it("can own the stable application main landmark", () => {
    render(
      <PageBody
        as="main"
        id="main-content"
        tabIndex={-1}
        mode="workspace"
      >
        Route content
      </PageBody>,
    );

    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(screen.getByRole("main")).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("main")).toHaveClass(
      "ui-page__body",
      "ui-page__body--workspace",
    );
  });
});
