import { render, screen } from "@testing-library/react";
import type { WorkbenchSiteGroup } from "../../../../shared/workbench-sites";
import { LocalizationProvider } from "../../../localization/LocalizationProvider";
import { SiteDrawer } from "./SiteDrawer";

describe("SiteDrawer", () => {
  it("uses shared fields and default footer buttons for site details", () => {
    const groups = [
      {
        id: "group-1",
        name: "常用",
        position: 0,
      },
    ] as WorkbenchSiteGroup[];
    render(
      <LocalizationProvider>
        <SiteDrawer
          groups={groups}
          saving={false}
          onClose={vi.fn()}
          onSave={vi.fn(async () => undefined)}
          onPickIcon={vi.fn(async () => undefined)}
        />
      </LocalizationProvider>,
    );

    for (const label of ["名称", "URL", "所属分组"]) {
      expect(screen.getByLabelText(label).closest(".ui-field")).not.toBeNull();
    }
    expect(screen.getByRole("button", { name: "取消" })).toHaveClass(
      "ui-button--default",
    );
    expect(screen.getByRole("button", { name: "保存" })).toHaveClass(
      "ui-button--default",
      "ui-button--primary",
    );
  });
});
