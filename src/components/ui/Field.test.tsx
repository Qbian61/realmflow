import { render, screen } from "@testing-library/react";
import * as FieldModule from "./Field";

const { Field } = FieldModule;

describe("Field", () => {
  it("associates its label, description and error with the control", () => {
    render(
      <Field
        name="profile-name"
        label="Name"
        description="Visible to teammates"
        error="Required"
      >
        <input />
      </Field>,
    );

    const input = screen.getByRole("textbox", { name: "Name" });
    expect(input).toHaveAccessibleDescription(
      "Visible to teammates Required",
    );
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("name", "profile-name");
    expect(input).toHaveAttribute("autocomplete", "off");
  });

  it("forwards disabled state to native controls", () => {
    render(
      <Field name="profile-status" label="Status" disabled>
        <select defaultValue="ready">
          <option value="ready">Ready</option>
        </select>
      </Field>,
    );

    expect(screen.getByRole("combobox", { name: "Status" })).toBeDisabled();
  });

  it("preserves an explicit native control name", () => {
    render(
      <Field name="fallback-name" label="Name">
        <input name="committed-name" />
      </Field>,
    );

    expect(screen.getByRole("textbox", { name: "Name" })).toHaveAttribute(
      "name",
      "committed-name",
    );
  });

  it("groups an end adornment with the native control without breaking field semantics", () => {
    render(
      <Field
        name="api-key"
        label="API Key"
        description="Stored securely"
        endAdornment={<button type="button">Show key</button>}
      >
        <input autoComplete="new-password" />
      </Field>,
    );

    const input = screen.getByRole("textbox", { name: "API Key" });
    const group = input.closest(".ui-field__control-group");

    expect(group).not.toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Show key" })
        .closest(".ui-field__control-group"),
    ).toBe(group);
    expect(input).toHaveAccessibleDescription("Stored securely");
    expect(input).toHaveAttribute("name", "api-key");
    expect(input).toHaveAttribute("autocomplete", "new-password");
  });

  it("focuses the first invalid control without discarding field state", () => {
    const focusFirstInvalidControl = (
      FieldModule as typeof FieldModule & {
        focusFirstInvalidControl?: (form: HTMLFormElement) => void;
      }
    ).focusFirstInvalidControl;
    render(
      <form aria-label="Profile">
        <input name="first" aria-invalid="true" defaultValue="draft one" />
        <input name="second" aria-invalid="true" defaultValue="draft two" />
      </form>,
    );
    const form = screen.getByRole("form", {
      name: "Profile",
    }) as HTMLFormElement;
    const first = screen.getByDisplayValue("draft one");
    const second = screen.getByDisplayValue("draft two");
    second.focus();

    expect(focusFirstInvalidControl).toBeTypeOf("function");
    focusFirstInvalidControl?.(form);

    expect(first).toHaveFocus();
    expect(first).toHaveValue("draft one");
    expect(second).toHaveValue("draft two");
  });
});
