import {
  fireEvent,
  render as testingRender,
  screen,
} from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { RequirementNodeActionCapabilityDto } from "../../../shared/business";
import { LocalizationProvider } from "../../localization/LocalizationProvider";
import type { Locale } from "../../localization/locales";
import {
  WorkflowNodeActionMenu,
  type WorkflowNodeAction,
} from "./WorkflowNodeActionMenu";

const enabled: RequirementNodeActionCapabilityDto = { enabled: true };

function renderMenu(
  input: {
    capabilities?: Record<
      WorkflowNodeAction,
      RequirementNodeActionCapabilityDto
    >;
    pending?: boolean;
    onAction?: (action: WorkflowNodeAction) => void;
    onClose?: () => void;
    anchor?: HTMLButtonElement;
    anchorBounds?: Partial<DOMRect>;
    locale?: Locale;
  } = {},
) {
  const onAction = input.onAction ?? vi.fn();
  const onClose = input.onClose ?? vi.fn();
  const onParentClick = vi.fn();
  const anchor = input.anchor ?? document.createElement("button");
  vi.spyOn(anchor, "getBoundingClientRect").mockReturnValue({
    top: 100,
    right: 260,
    bottom: 132,
    left: 220,
    width: 40,
    height: 32,
    x: 220,
    y: 100,
    ...input.anchorBounds,
    toJSON: () => undefined,
  });
  const result = testingRender(
    <LocalizationProvider storage={storageWithLocale(input.locale ?? "zh-CN")}>
      <div onClick={onParentClick}>
        <MenuHarness
          anchor={anchor}
          capabilities={input.capabilities}
          pending={input.pending}
          onAction={onAction}
          onClose={onClose}
        />
      </div>
    </LocalizationProvider>,
  );

  return { ...result, anchor, onAction, onClose, onParentClick };
}

function MenuHarness({
  anchor,
  capabilities,
  pending,
  onAction,
  onClose,
}: {
  anchor: HTMLButtonElement;
  capabilities?: Record<
    WorkflowNodeAction,
    RequirementNodeActionCapabilityDto
  >;
  pending?: boolean;
  onAction: (action: WorkflowNodeAction) => void;
  onClose: () => void;
}): JSX.Element | null {
  const [open, setOpen] = useState(true);
  return open ? (
    <WorkflowNodeActionMenu
      nodeName="需求分析"
      capabilities={
        capabilities ?? {
          retry: enabled,
          skip: enabled,
          rollback: enabled,
        }
      }
      pending={pending ?? false}
      anchor={anchor}
      onAction={onAction}
      onClose={() => {
        onClose();
        setOpen(false);
      }}
    />
  ) : null;
}

describe("WorkflowNodeActionMenu", () => {
  it("renders only retry, skip, and rollback in a stable order", () => {
    renderMenu({
      capabilities: {
        retry: { enabled: false, reasonCode: "retry_limit_reached" },
        skip: enabled,
        rollback: enabled,
      },
    });

    expect(screen.getByRole("menu", { name: "需求分析节点操作" })).toBeVisible();
    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual([
      "重试已达到重试次数上限",
      "跳过",
      "回退到此节点",
    ]);
    expect(
      screen.queryByRole("menuitem", { name: /删除/ }),
    ).not.toBeInTheDocument();
  });

  it("exposes disabled capability reasons through title and accessible text", () => {
    renderMenu({
      capabilities: {
        retry: { enabled: false, reasonCode: "node_run_missing" },
        skip: { enabled: false, reasonCode: "skip_not_allowed" },
        rollback: { enabled: false, reasonCode: "no_execution_history" },
      },
    });

    const retry = screen.getByRole("menuitem", {
      name: "重试，不可用：找不到节点运行记录",
    });
    expect(retry).toBeDisabled();
    expect(retry).toHaveAttribute("title", "找不到节点运行记录");
    expect(
      screen.getByRole("menuitem", {
        name: "跳过，不可用：节点策略不允许跳过",
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole("menuitem", {
        name: "回退到此节点，不可用：节点没有执行历史",
      }),
    ).toBeDisabled();
    expect(
      screen.getAllByText(/找不到节点运行记录|节点策略不允许跳过|节点没有执行历史/),
    ).toSatisfy((reasons: HTMLElement[]) =>
      reasons.every((reason) =>
        reason.classList.contains("workflow-node-quick-menu-reason"),
      ),
    );
  });

  it("disables every action with a pending reason", () => {
    renderMenu({ pending: true });

    expect(screen.getAllByRole("menuitem")).toSatisfy(
      (items: HTMLButtonElement[]) =>
        items.every(
          (item) =>
            item.disabled &&
            item.title === "操作正在处理中，请稍候",
        ),
    );
  });

  it("returns only the selected action and does not bubble menu clicks", () => {
    const { onAction, onParentClick } = renderMenu();

    fireEvent.click(screen.getByRole("menuitem", { name: "重试" }));

    expect(onAction).toHaveBeenCalledOnce();
    expect(onAction).toHaveBeenCalledWith("retry");
    expect(onParentClick).not.toHaveBeenCalled();
  });

  it("ignores disabled actions", () => {
    const { onAction } = renderMenu({
      capabilities: {
        retry: { enabled: false, reasonCode: "retry_limit_reached" },
        skip: enabled,
        rollback: enabled,
      },
    });

    fireEvent.click(
      screen.getByRole("menuitem", {
        name: "重试，不可用：已达到重试次数上限",
      }),
    );

    expect(onAction).not.toHaveBeenCalled();
  });

  it("focuses the first enabled action and returns focus on Escape", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "打开节点菜单";
    document.body.append(trigger);
    trigger.focus();

    renderMenu({
      anchor: trigger,
      capabilities: {
        retry: { enabled: false, reasonCode: "invalid_state" },
        skip: enabled,
        rollback: enabled,
      },
    });

    expect(screen.getByRole("menuitem", { name: "跳过" })).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  it("positions from its anchor, supports arrow navigation, and reports close", () => {
    const onClose = vi.fn();
    const { anchor } = renderMenu({ onClose });
    const menu = screen.getByRole("menu");
    const items = screen.getAllByRole("menuitem");

    expect(menu).toHaveStyle({
      position: "fixed",
      top: "140px",
      left: "40px",
      visibility: "visible",
    });
    expect(menu.parentElement).toBe(document.body);
    expect(menu).toHaveClass("ui-menu");
    expect(items[0]).toHaveClass("ui-menu-item");
    expect(anchor.getBoundingClientRect).toHaveBeenCalled();

    fireEvent.keyDown(items[0], { key: "ArrowDown" });
    expect(items[1]).toHaveFocus();
    fireEvent.keyDown(items[1], { key: "ArrowUp" });
    expect(items[0]).toHaveFocus();
    fireEvent.keyDown(items[0], { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("flips above and stays inside the viewport near the bottom-right edge", () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(300);
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(240);
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(160);

    renderMenu({
      anchorBounds: {
        top: 200,
        right: 292,
        bottom: 232,
        left: 260,
        width: 32,
        height: 32,
        x: 260,
        y: 200,
      },
    });

    expect(screen.getByRole("menu")).toHaveStyle({
      top: "32px",
      left: "68px",
      maxHeight: "180px",
      visibility: "visible",
    });
  });

  it.each([
    {
      locale: "zh-CN",
      menu: "需求分析节点操作",
      actions: ["重试", "跳过", "回退到此节点"],
      reason: "节点不可执行",
    },
    {
      locale: "en",
      menu: "Actions for 需求分析 node",
      actions: ["Retry", "Skip", "Roll back to this node"],
      reason: "This node is not executable",
    },
    {
      locale: "ja",
      menu: "需求分析ノードの操作",
      actions: ["再試行", "スキップ", "このノードに戻す"],
      reason: "このノードは実行できません",
    },
  ] as const)("renders the complete action menu in $locale", (expected) => {
    renderMenu({
      locale: expected.locale,
      capabilities: {
        retry: { enabled: false, reasonCode: "not_executable" },
        skip: enabled,
        rollback: enabled,
      },
    });

    expect(screen.getByRole("menu", { name: expected.menu })).toBeVisible();
    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual([
      `${expected.actions[0]}${expected.reason}`,
      ...expected.actions.slice(1),
    ]);
  });
});

function storageWithLocale(locale: Locale): Storage {
  return {
    getItem: vi.fn(() => JSON.stringify({ version: 1, locale })),
    setItem: vi.fn(),
  } as unknown as Storage;
}
