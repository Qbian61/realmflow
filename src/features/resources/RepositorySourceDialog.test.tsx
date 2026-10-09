import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import type { BusinessApi } from "../../../shared/business";
import { LocalizationProvider } from "../../localization/LocalizationProvider";
import { ToastProvider } from "../toast/ToastProvider";
import { RepositorySourceDialog } from "./RepositorySourceDialog";

describe("RepositorySourceDialog", () => {
  it("uses the shared dialog, field, button, and scroll-body primitives", () => {
    renderDialog(remoteBusiness());

    const dialog = screen.getByRole("dialog", { name: "关联代码仓库" });
    const scrollBody = dialog.querySelector('[data-dialog-scroll="true"]');

    expect(dialog).toHaveClass("ui-dialog", "ui-dialog--default");
    expect(dialog.querySelector(".ui-dialog__header")).toBeInTheDocument();
    expect(scrollBody).toHaveClass("ui-dialog__body");
    expect(scrollBody?.querySelectorAll(".ui-field")).toHaveLength(2);
    expect(dialog.querySelector(".ui-dialog__footer")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "确认关联" }),
    ).toHaveClass("ui-button", "ui-button--primary");
    expect(dialog.querySelectorAll('[data-dialog-scroll="true"]')).toHaveLength(
      1,
    );
  });

  it("publishes a safe toast when repository synchronization fails", async () => {
    const sensitiveError =
      "clone https://user:password@example.test/private.git failed";
    const business = remoteBusiness({
      ingestRemoteRepository: vi
        .fn()
        .mockRejectedValue(new Error(sensitiveError)),
    });
    renderDialog(business);

    fireEvent.click(screen.getByRole("button", { name: "远程仓库" }));
    fireEvent.change(screen.getByRole("textbox", { name: "仓库名称" }), {
      target: { value: "Private repository" },
    });
    await screen.findByRole("option", { name: "Example connector" });
    fireEvent.change(screen.getByRole("textbox", { name: "仓库路径" }), {
      target: { value: "https://user:password@example.test/private.git" },
    });
    await screen.findByRole("option", { name: "main" });
    fireEvent.click(screen.getByRole("button", { name: "确认关联" }));

    expect(
      await screen.findByText("代码仓库同步失败，请检查仓库配置后重试"),
    ).toBeInTheDocument();
    expect(screen.queryByText(sensitiveError)).not.toBeInTheDocument();
    expect(
      document.querySelector(
        ".repository-source-dialog .ui-dialog__body [role='alert']",
      ),
    ).toBeNull();
  });

  it("keeps branch list loading failures inline", async () => {
    const business = remoteBusiness({
      listRepositoryBranches: vi
        .fn()
        .mockRejectedValue(new Error("branch list failed")),
    });
    renderDialog(business);

    fireEvent.click(screen.getByRole("button", { name: "远程仓库" }));
    await screen.findByRole("option", { name: "Example connector" });
    fireEvent.change(screen.getByRole("textbox", { name: "仓库路径" }), {
      target: { value: "/repositories/example" },
    });

    await waitFor(() => {
      expect(
        document.querySelector(
          ".repository-source-dialog .ui-dialog__body [role='alert']",
        ),
      ).toHaveTextContent("无法读取仓库分支");
    });
  });
});

function remoteBusiness(
  overrides: Partial<BusinessApi> = {},
): BusinessApi {
  return {
    listConnectors: vi.fn().mockResolvedValue([
      {
        connector: {
          id: "connector-1",
          name: "Example connector",
          enabled: true,
        },
      },
    ]),
    listRepositoryBranches: vi
      .fn()
      .mockResolvedValue([{ name: "main", current: true }]),
    ...overrides,
  } as unknown as BusinessApi;
}

function renderDialog(business: BusinessApi): void {
  render(
    <LocalizationProvider>
      <ToastProvider>
        <RepositorySourceDialog
          business={business}
          spaceId="space-1"
          sortOrder={0}
          onSaved={vi.fn()}
          onClose={vi.fn()}
          onPersistenceUnavailable={vi.fn()}
        />
      </ToastProvider>
    </LocalizationProvider>,
  );
}
