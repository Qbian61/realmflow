import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Select } from "./Select";

describe("Select", () => {
  it("displays and selects options nested in provider groups", () => {
    const onChange = vi.fn();
    render(
      <Select aria-label="Model" value="primary" onChange={onChange}>
        <option value="auto">Automatic</option>
        <optgroup label="Provider">
          <option value="primary">Primary model</option>
          <option value="secondary">Secondary model</option>
        </optgroup>
        <optgroup label="Unavailable" disabled>
          <option value="disabled">Disabled model</option>
        </optgroup>
      </Select>,
    );
    expect(screen.getByText("Primary model")).toBeVisible();
    fireEvent.click(screen.getByRole("combobox", { name: "Model" }));
    expect(screen.getByRole("group", { name: "Provider" })).toBeVisible();
    expect(screen.getByRole("option", { name: "Disabled model" })).toBeDisabled();
    fireEvent.click(screen.getByRole("option", { name: "Secondary model" }));
    expect(onChange.mock.calls[0][0].target.value).toBe("secondary");
  });

  it("renders a model-sized combobox and emits native-like change events", () => {
    const onChange = vi.fn();

    render(
      <Select aria-label="Status" value="ready" onChange={onChange}>
        <option value="">All</option>
        <option value="ready">Ready</option>
        <option value="blocked">Blocked</option>
      </Select>,
    );

    const trigger = screen.getByRole("combobox", { name: "Status" });
    expect(trigger).toHaveClass("model-selector-trigger");
    expect(screen.getByText("Ready")).toBeVisible();

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("option", { name: "Blocked" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].target.value).toBe("blocked");
  });

  it("exposes selectedOptions when multiple values are toggled", () => {
    const onChange = vi.fn();

    render(
      <Select
        multiple
        aria-label="Tags"
        value={["alpha"]}
        onChange={onChange}
      >
        <option value="alpha">Alpha</option>
        <option value="beta">Beta</option>
      </Select>,
    );

    fireEvent.click(screen.getByRole("combobox", { name: "Tags" }));
    fireEvent.click(screen.getByRole("option", { name: "Beta" }));

    const event = onChange.mock.calls[0][0];
    expect([...event.target.selectedOptions].map(({ value }) => value)).toEqual([
      "alpha",
      "beta",
    ]);
  });

  it("keeps native form attributes on the single-value combobox", () => {
    render(
      <Select aria-label="Status" autoComplete="off" name="status" value="ready">
        <option value="ready">Ready</option>
      </Select>,
    );

    const trigger = screen.getByRole("combobox", { name: "Status" });
    expect(trigger).toHaveAttribute("name", "status");
    expect(trigger).toHaveAttribute("autocomplete", "off");
  });

  it("derives an accessible name when wrapped by a native label", () => {
    render(
      <label>
        Status
        <Select value="ready">
          <option value="ready">Ready</option>
        </Select>
      </label>,
    );

    expect(screen.getByLabelText("Status")).toHaveValue("ready");
  });

  it("keeps htmlFor labels as the accessible name when an id is provided", () => {
    render(
      <>
        <label htmlFor="status-control">Status</label>
        <Select id="status-control" value="ready">
          <option value="ready">Ready</option>
        </Select>
      </>,
    );

    expect(screen.getByRole("combobox", { name: "Status" })).toHaveValue(
      "ready",
    );
  });

  it("keeps option value and title metadata on menu items", () => {
    render(
      <Select aria-label="Folder" value="folder:/work/alpha/tasks">
        <option value="folder:/work/alpha/tasks" title="/work/alpha/tasks">
          tasks
        </option>
      </Select>,
    );

    fireEvent.click(screen.getByRole("combobox", { name: "Folder" }));
    const option = screen.getByRole("option", { name: "tasks" });

    expect(option).toHaveAttribute("value", "folder:/work/alpha/tasks");
    expect(option).toHaveAttribute("title", "/work/alpha/tasks");
  });
});
