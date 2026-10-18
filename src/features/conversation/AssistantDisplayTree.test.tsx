import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import type {
  AssistantDisplayNode,
  AssistantTurnProjection,
} from "../../../domain/assistant-turn";
import { LocalizationProvider } from "../../localization/LocalizationProvider";
import { AssistantExecutionTimeline } from "./AssistantExecutionTimeline";

function toolTree(
  status: "running" | "completed" | "failed" | "waiting_permission",
): AssistantDisplayNode[] {
  return [
    {
      id: "group-1",
      kind: "execution_group",
      order: 1,
      groupType: "command",
      title: "执行命令",
      status,
      defaultExpanded: false,
      children: [
        {
          id: "tool-1",
          kind: "tool_call",
          order: 1,
          toolCall: {
            callId: "call-1",
            toolExecutionId: "execution-1",
            toolName: "npm test",
            category: "command",
            status,
            argumentsSummary: "npm test",
            requestedAt: 100,
            error: status === "failed" ? "Tests failed" : undefined,
          },
          view: { type: "command", title: "运行 npm test" },
        },
      ],
    },
  ];
}

function projection(
  status: AssistantTurnProjection["status"],
  tree = toolTree(status === "completed" ? "completed" : status as "running"),
): AssistantTurnProjection {
  return {
    schemaVersion: 2,
    runId: "run-1",
    turnId: "turn-1",
    assistantMessageId: "assistant-1",
    status,
    startedAt: 100,
    completedAt: status === "completed" ? 2_600 : undefined,
    answer: "",
    tree,
    collapsedDefaults: [],
    executionSummaries: [],
    references: [],
    toolCalls: [],
    delegations: [],
    compactions: [],
    lastSequence: 1,
  };
}

function renderTimeline(execution: AssistantTurnProjection) {
  return render(
    <LocalizationProvider>
      <AssistantExecutionTimeline execution={execution} />
    </LocalizationProvider>,
  );
}

it("conditionally mounts Progress, Group, and Tool detail levels", () => {
  renderTimeline(projection("completed"));

  expect(screen.queryByRole("button", { name: "已执行 1 条命令" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "任务耗时 2.5s" }));

  const group = screen.getByRole("button", { name: "已执行 1 条命令" });
  expect(group).toHaveAttribute("aria-expanded", "false");
  expect(group.firstElementChild).toHaveTextContent("已执行 1 条命令");
  expect(group.lastElementChild?.tagName).toBe("svg");
  expect(screen.queryByRole("group", { name: "命令已执行" })).not.toBeInTheDocument();
  fireEvent.click(group);

  const tool = screen.getByRole("group", { name: "命令已执行" });
  expect(tool).toHaveTextContent("npm test");
  expect(
    screen.queryByRole("button", { name: "运行 npm test" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "复制命令" })).toBeInTheDocument();
  expect(screen.getByText("npm test", { selector: "code" })).toBeInTheDocument();
});

it("renders the progress group transparently and summarizes its Tool segment", () => {
  const tree: AssistantDisplayNode[] = [
    {
      id: "progress",
      kind: "execution_group",
      order: 1,
      groupType: "progress",
      title: "Task progress",
      status: "completed",
      defaultExpanded: false,
      children: [
        {
          id: "activity:1",
          kind: "execution_group",
          order: 1,
          groupType: "command",
          title: "Tools",
          status: "completed",
          defaultExpanded: false,
          children: [
            {
              id: "tool-1",
              kind: "tool_call",
              order: 1,
              toolCall: {
                callId: "call-1",
                toolName: "process.run",
                category: "command",
                status: "completed",
                argumentsSummary: '{"command":"npm test"}',
                requestedAt: 100,
              },
              view: { type: "command", title: "process.run" },
            },
          ],
        },
      ],
    },
  ];
  renderTimeline(projection("completed", tree));

  fireEvent.click(screen.getByRole("button", { name: "任务耗时 2.5s" }));

  expect(screen.queryByText("Task progress")).not.toBeInTheDocument();
  expect(screen.queryByText("Tools")).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "已执行 1 条命令" }),
  ).toHaveAttribute("aria-expanded", "false");
});

it("keeps a running Tool segment compact while Progress stays open", () => {
  renderTimeline(projection("running", toolTree("running")));
  expect(screen.getByRole("button", { name: /任务耗时/ })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  expect(
    screen.getByRole("button", {
      name: "已执行 1 条命令",
    }),
  ).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  expect(
    screen.queryByRole("button", { name: "运行 npm test" }),
  ).not.toBeInTheDocument();
});

it("auto-expands the waiting-permission path", () => {
  renderTimeline(
    projection("waiting_permission", toolTree("waiting_permission")),
  );
  expect(screen.getByRole("button", { name: /任务耗时/ })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  expect(
    screen.getByRole("button", {
      name: "已执行 1 条命令，等待授权",
    }),
  ).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  expect(
    screen.getByRole("group", { name: "等待授权" }),
  ).toHaveTextContent("npm test");
});

it("exposes failed Tool details with the failed activity group", () => {
  renderTimeline(projection("failed", toolTree("failed")));

  expect(screen.getByRole("button", { name: /任务耗时/ })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  expect(screen.getByRole("button", { name: "1 项操作失败" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  expect(
    screen.getByRole("group", { name: "运行 npm test失败" }),
  ).toBeInTheDocument();
  expect(screen.getByText("Tests failed")).toBeInTheDocument();
});

it("auto-expands mixed Tool groups when a failed operation needs recovery guidance", () => {
  const tree: AssistantDisplayNode[] = [
    {
      id: "activity:mixed",
      kind: "execution_group",
      order: 1,
      groupType: "command",
      title: "Tools",
      status: "running",
      defaultExpanded: false,
      children: [
        {
          id: "tool-ok",
          kind: "tool_call",
          order: 1,
          toolCall: {
            callId: "call-ok",
            toolName: "rf_sessions_list_a1b2c3d4",
            category: "other",
            status: "completed",
            argumentsSummary: "{}",
            requestedAt: 100,
          },
          view: { type: "generic", title: "List sessions" },
        },
        {
          id: "tool-failed",
          kind: "tool_call",
          order: 2,
          toolCall: {
            callId: "call-failed",
            toolName: "rf_builtin_computer_observe_a1b2c3d4",
            category: "other",
            status: "failed",
            argumentsSummary: "{}",
            requestedAt: 120,
            errorCode: "computer_accessibility_permission_required",
            error: "Computer Use Accessibility permission is required",
          },
          view: { type: "generic", title: "Observe screen" },
        },
      ],
    },
  ];

  renderTimeline(projection("running", tree));

  expect(
    screen.getByRole("button", { name: "已执行 1 项操作，1 项失败" }),
  ).toHaveAttribute("aria-expanded", "true");
  expect(
    screen.getByRole("group", { name: "执行内置工具失败" }),
  ).toHaveTextContent("需要在系统设置中开启辅助功能权限");
  expect(
    screen.getByText(
      "打开 macOS 系统设置 > 隐私与安全性 > 辅助功能，允许 RealmFlow 控制电脑后重试。",
    ),
  ).toBeInTheDocument();
});

it("collapses reference content behind a semantic summary", () => {
  const tree: AssistantDisplayNode[] = [
    {
      id: "references",
      kind: "reference_group",
      order: 1,
      references: [
        {
          id: "reference-1",
          title: "RealmFlow 设计",
          sourceType: "local_file",
          summary: "设计约束",
        },
      ],
    },
  ];
  renderTimeline(projection("completed", tree));
  fireEvent.click(screen.getByRole("button", { name: "任务耗时 2.5s" }));

  const references = screen.getByRole("button", { name: "参考内容" });
  expect(references).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByText("RealmFlow 设计")).not.toBeInTheDocument();

  fireEvent.click(references);
  expect(screen.getByText("RealmFlow 设计")).toBeInTheDocument();
});

it("summarizes delegated work in completed Chinese", () => {
  const delegation: AssistantDisplayNode = {
    id: "sub-agents",
    kind: "sub_agent_group",
    order: 1,
    group: {
      groupId: "group-1",
      callId: "call-1",
      parentRunId: "run-1",
      strategy: "parallel",
      status: "completed",
      requestedAt: 100,
      completedAt: 200,
      children: [
        {
          taskId: "task-1",
          childRunId: "child-run-1",
          childSessionId: "child-session-1",
          ordinal: 1,
          objective: "分析实现",
          status: "completed",
          evidenceCount: 0,
          artifactIds: [],
          tree: [],
        },
      ],
    },
  };
  const tree: AssistantDisplayNode[] = [
    {
      id: "sub_agent",
      kind: "execution_group",
      order: 1,
      groupType: "sub_agent",
      title: "Sub-agents",
      status: "completed",
      defaultExpanded: false,
      children: [delegation],
    },
  ];
  renderTimeline(projection("completed", tree));
  fireEvent.click(screen.getByRole("button", { name: "任务耗时 2.5s" }));

  expect(
    screen.getByRole("button", { name: "已委派 1 个子任务" }),
  ).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByText("Sub-agents")).not.toBeInTheDocument();
});

it("keeps completed Sub-agent reports behind a compact child disclosure", () => {
  const delegation: AssistantDisplayNode = {
    id: "sub-agents",
    kind: "sub_agent_group",
    order: 1,
    group: {
      groupId: "group-1",
      callId: "call-1",
      parentRunId: "run-1",
      strategy: "parallel",
      status: "running",
      requestedAt: 100,
      children: [
        {
          taskId: "task-1",
          childRunId: "child-run-1",
          childSessionId: "child-session-1",
          ordinal: 1,
          agentName: "代码审查 Agent",
          objective: "审查 Renderer 的渲染边界并返回证据",
          status: "completed",
          resultSummary: "## 审查结论\n\n未发现跨层依赖。",
          evidenceCount: 2,
          artifactIds: [],
          tree: [],
        },
      ],
    },
  };
  renderTimeline(projection("running", [delegation]));

  const child = screen.getByRole("button", {
    name: "代码审查 Agent · 已完成",
  });
  expect(child).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByText("审查 Renderer 的渲染边界并返回证据")).toHaveClass(
    "assistant-sub-agent-objective",
  );
  expect(screen.queryByText(/未发现跨层依赖/)).not.toBeInTheDocument();
  expect(document.querySelector(".assistant-sub-agent-indicator")).toBeInTheDocument();

  fireEvent.click(child);
  expect(child).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByText(/未发现跨层依赖/)).toBeInTheDocument();
});

it("preserves a manual close when the same node receives another active update", () => {
  const rendered = renderTimeline(projection("running"));
  const group = screen.getByRole("button", {
    name: "已执行 1 条命令",
  });
  fireEvent.click(group);
  fireEvent.click(group);
  expect(screen.queryByRole("button", { name: "运行 npm test" })).not.toBeInTheDocument();

  rendered.rerender(
    <LocalizationProvider>
      <AssistantExecutionTimeline
        execution={{ ...projection("running"), lastSequence: 2 }}
      />
    </LocalizationProvider>,
  );
  expect(
    screen.getByRole("button", {
      name: "已执行 1 条命令",
    }),
  ).toHaveAttribute("aria-expanded", "false");
});

it("supports ArrowRight, ArrowLeft, Enter, and Space keyboard control", () => {
  renderTimeline(projection("completed"));
  const progress = screen.getByRole("button", { name: "任务耗时 2.5s" });
  fireEvent.keyDown(progress, { key: "ArrowRight" });
  const group = screen.getByRole("button", { name: "已执行 1 条命令" });
  fireEvent.keyDown(group, { key: "ArrowRight" });
  expect(screen.getByRole("group", { name: "命令已执行" })).toBeInTheDocument();
  fireEvent.keyDown(group, { key: " " });
  expect(
    screen.queryByRole("group", { name: "命令已执行" }),
  ).not.toBeInTheDocument();
  fireEvent.keyDown(group, { key: "Enter" });
  expect(screen.getByText("npm test", { selector: "code" })).toBeInTheDocument();
  fireEvent.keyDown(group, { key: "ArrowLeft" });
  expect(
    screen.queryByRole("group", { name: "命令已执行" }),
  ).not.toBeInTheDocument();
});

it("restores nested disclosure state and scroll position after reopening Progress", () => {
  renderTimeline(projection("completed"));
  const progress = screen.getByRole("button", { name: "任务耗时 2.5s" });
  fireEvent.click(progress);
  fireEvent.click(screen.getByRole("button", { name: "已执行 1 条命令" }));
  const body = screen.getByTestId("assistant-display-tree-scroll");
  body.scrollTop = 48;
  fireEvent.scroll(body);

  fireEvent.click(progress);
  expect(screen.queryByTestId("assistant-display-tree-scroll")).not.toBeInTheDocument();
  fireEvent.click(progress);

  expect(screen.getByRole("button", { name: "已执行 1 条命令" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  expect(screen.getByRole("group", { name: "命令已执行" })).toBeInTheDocument();
  expect(screen.getByTestId("assistant-display-tree-scroll").scrollTop).toBe(48);
});
