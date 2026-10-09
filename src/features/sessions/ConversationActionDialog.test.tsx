import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { LocalizationProvider } from "../../localization/LocalizationProvider";
import { ConversationActionDialog } from "./ConversationActionDialog";

const session = {
  id: "conversation-1",
  kind: "general" as const,
  title: "产品讨论",
  spacePath: "",
  messages: [],
  createdAt: 1,
  updatedAt: 2,
};

describe("ConversationActionDialog", () => {
  it("validates and submits a renamed conversation", () => {
    const onRename = vi.fn();
    renderDialog({ mode: "rename", onRename });

    const input = screen.getByRole("textbox", { name: "新名称" });
    expect(input).toHaveValue("产品讨论");
    expect(screen.getByRole("button", { name: "确认重命名" })).toBeDisabled();

    fireEvent.change(input, { target: { value: "  新产品讨论  " } });
    fireEvent.click(screen.getByRole("button", { name: "确认重命名" }));

    expect(onRename).toHaveBeenCalledWith("新产品讨论");
  });

  it("requires a second confirmation before deletion", () => {
    const onDelete = vi.fn();
    renderDialog({ mode: "delete", onDelete });

    expect(screen.getByRole("dialog", { name: "删除对话" })).toHaveTextContent(
      "产品讨论",
    );
    expect(screen.getByText(/删除后无法恢复/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "确认删除对话" }));

    expect(onDelete).toHaveBeenCalledOnce();
  });
});

function renderDialog(
  overrides: Partial<React.ComponentProps<typeof ConversationActionDialog>>,
) {
  const props: React.ComponentProps<typeof ConversationActionDialog> = {
    session,
    mode: "rename",
    pending: false,
    onClose: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  return render(
    <LocalizationProvider>
      <ConversationActionDialog {...props} />
    </LocalizationProvider>,
  );
}
