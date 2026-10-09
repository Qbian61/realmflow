import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { ModelSelector } from "./ModelSelector";

const groups = [
  {
    providerId: "provider-alpha",
    providerName: "Alpha",
    models: [
      { value: "profile-a", label: "Alpha Chat" },
      { value: "profile-b", label: "Alpha Reasoner" },
    ],
  },
  {
    providerId: "provider-beta",
    providerName: "Beta",
    models: [{ value: "profile-c", label: "Beta Vision" }],
  },
  {
    providerId: "provider-alpha",
    providerName: "Alpha",
    models: [{ value: "profile-d", label: "Alpha Vision" }],
  },
];

describe("ModelSelector", () => {
  it("refreshes on open and keeps provider models together without group headings", () => {
    const onOpen = vi.fn();
    const onChange = vi.fn();
    render(
      <ModelSelector
        ariaLabel="Conversation model"
        autoLabel="Auto select"
        configureLabel="Configure models..."
        emptyLabel="No matching models"
        searchPlaceholder="Search models"
        groups={groups}
        value=""
        onOpen={onOpen}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("combobox", { name: "Conversation model" }));

    expect(onOpen).toHaveBeenCalledOnce();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(document.querySelector(".model-selector-list section")).toBeNull();
    expect(
      screen.getAllByRole("option").map((option) =>
        option.querySelector(".model-selector-option-label")?.textContent,
      ),
    ).toEqual([
      "Auto select",
      "Alpha Chat",
      "Alpha Reasoner",
      "Alpha Vision",
      "Beta Vision",
    ]);
    expect(
      screen.getAllByTestId("provider-logo-provider-alpha"),
    ).toHaveLength(3);
    expect(screen.getAllByTestId("provider-logo-provider-beta")).toHaveLength(
      1,
    );
    fireEvent.click(screen.getByRole("option", { name: "Beta Vision" }));
    expect(onChange).toHaveBeenCalledWith("profile-c");
  });

  it("exposes model configuration without a search control", () => {
    const onConfigure = vi.fn();
    render(
      <ModelSelector
        ariaLabel="Conversation model"
        autoLabel="Auto select"
        configureLabel="Configure models..."
        emptyLabel="No matching models"
        searchPlaceholder="Search models"
        groups={groups}
        value=""
        onChange={vi.fn()}
        onConfigure={onConfigure}
      />,
    );

    fireEvent.click(screen.getByRole("combobox", { name: "Conversation model" }));

    expect(screen.queryByPlaceholderText("Search models")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Configure models..." }));
    expect(onConfigure).toHaveBeenCalledOnce();
  });

  it("keeps a missing saved value while showing its effective fallback", () => {
    render(
      <ModelSelector
        ariaLabel="Conversation model"
        autoLabel="Auto select"
        configureLabel="Configure models..."
        emptyLabel="No matching models"
        searchPlaceholder="Search models"
        groups={groups}
        value="profile-retired"
        effectiveValue="profile-a"
        onChange={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("combobox", { name: "Conversation model" }),
    ).toHaveTextContent("Alpha Chat");
  });

  it("shows automatic selection when no profile is explicitly selected", () => {
    render(
      <ModelSelector
        ariaLabel="Conversation model"
        autoLabel="Auto select"
        configureLabel="Configure models..."
        emptyLabel="No matching models"
        searchPlaceholder="Search models"
        groups={groups}
        value=""
        effectiveValue="profile-a"
        onChange={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("combobox", { name: "Conversation model" }),
    ).toHaveTextContent("Auto select");
  });

  it("opens downward when there is not enough space above the trigger", () => {
    const rect = {
      top: 120,
      right: 700,
      bottom: 152,
      left: 616,
      width: 84,
      height: 32,
      x: 616,
      y: 120,
      toJSON: () => ({}),
    };
    const bounds = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue(rect);

    render(
      <ModelSelector
        ariaLabel="Conversation model"
        autoLabel="Auto select"
        configureLabel="Configure models..."
        emptyLabel="No matching models"
        searchPlaceholder="Search models"
        groups={groups}
        value=""
        onChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("combobox", { name: "Conversation model" }));

    expect(document.querySelector(".model-selector-popover")).toHaveAttribute(
      "data-placement",
      "down",
    );
    bounds.mockRestore();
  });

  it("uses the shared menu surface and supports listbox keyboard navigation", () => {
    render(
      <ModelSelector
        ariaLabel="Conversation model"
        autoLabel="Auto select"
        configureLabel="Configure models..."
        emptyLabel="No matching models"
        searchPlaceholder="Search models"
        groups={groups}
        value=""
        onChange={vi.fn()}
      />,
    );

    const trigger = screen.getByRole("combobox", {
      name: "Conversation model",
    });
    trigger.focus();
    fireEvent.click(trigger);

    const popover = document.querySelector(".model-selector-popover");
    const options = screen.getAllByRole("option");
    expect(popover).toHaveClass("ui-menu");
    expect(options[0]).toHaveFocus();
    fireEvent.keyDown(options[0], { key: "ArrowDown" });
    expect(options[1]).toHaveFocus();
    fireEvent.keyDown(options[1], { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
