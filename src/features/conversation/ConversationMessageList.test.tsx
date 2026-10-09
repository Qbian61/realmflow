import {
  act,
  fireEvent,
  render as testingRender,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ConversationMessageList } from "./ConversationMessageList";
import { LocalizationProvider } from "../../localization/LocalizationProvider";

function render(element: React.ReactNode) {
  return testingRender(element, {
    wrapper: ({ children }) => (
      <LocalizationProvider>{children}</LocalizationProvider>
    ),
  });
}

const routeActivity = vi.hoisted(() => ({ active: true }));

vi.mock("../navigation/WorkspaceRouteCache", () => ({
  useWorkspacePageActive: () => routeActivity.active,
}));

const messages = [
  {
    id: "user-1",
    role: "user" as const,
    status: "completed" as const,
    content: "Question",
  },
  {
    id: "assistant-1",
    role: "assistant" as const,
    status: "completed" as const,
    content: "Answer",
  },
];

function messageList(): JSX.Element {
  return (
    <ConversationMessageList
      messages={messages}
      labels={{
        messages: "Messages",
        messageIndex: "Message index",
        jumpToMessage: (index, preview) => `${index}: ${preview}`,
        tool: "Tool",
        generating: "Generating",
      }}
    />
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  routeActivity.active = true;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("scrolls to the last message again when a cached conversation reopens", () => {
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(640);
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());

  const view = render(messageList());
  const scroll = view.container.querySelector<HTMLElement>(
    ".chat-session-scroll",
  );
  expect(scroll?.scrollTop).toBe(640);

  if (!scroll) throw new Error("Expected the conversation scroll container");
  scroll.scrollTop = 0;
  routeActivity.active = false;
  view.rerender(messageList());
  expect(scroll.scrollTop).toBe(0);

  routeActivity.active = true;
  view.rerender(messageList());
  expect(scroll.scrollTop).toBe(640);
});

it("does not label a paused recovery state as generating", () => {
  render(
    <ConversationMessageList
      messages={[
        {
          id: "assistant-recovery",
          role: "assistant",
          status: "pending",
          content: "",
          execution: {
            runId: "run-1",
            assistantMessageId: "assistant-recovery",
            status: "recovery_blocked",
            startedAt: 100,
            answer: "",
            executionSummaries: [],
            references: [],
            toolCalls: [],
            delegations: [],
            lastSequence: 1,
            recovery: {
              reason: "capability_unavailable",
              actions: ["resume", "branch", "cancel"],
            },
          },
        },
      ]}
      labels={{
        messages: "Messages",
        messageIndex: "Message index",
        jumpToMessage: (index, preview) => `${index}: ${preview}`,
        tool: "Tool",
        generating: "Generating",
      }}
    />,
  );

  expect(screen.getByText("恢复受阻")).toBeInTheDocument();
  expect(screen.queryByText("Generating")).not.toBeInTheDocument();
});

it("renders persisted execution details for a completed assistant message", () => {
  render(
    <ConversationMessageList
      messages={[
        {
          id: "assistant-reloaded",
          role: "assistant",
          status: "completed",
          content: "The file is ready.",
          execution: {
            runId: "run-reloaded",
            assistantMessageId: "assistant-reloaded",
            status: "completed",
            startedAt: 1_000,
            completedAt: 3_500,
            answer: "The file is ready.",
            executionSummaries: [
              {
                id: "summary-reloaded",
                content: "Validated the generated file.",
                source: "system",
              },
            ],
            references: [],
            toolCalls: [],
            delegations: [],
            compactions: [],
            lastSequence: 2,
          },
        },
      ]}
      labels={{
        messages: "Messages",
        messageIndex: "Message index",
        jumpToMessage: (index, preview) => `${index}: ${preview}`,
        tool: "Tool",
        generating: "Generating",
      }}
    />,
  );

  const task = screen.getByRole("button", { name: "任务耗时 2.5 秒" });
  expect(task).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(task);
  expect(screen.getByText("任务完成")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "思考过程" }),
  ).toBeInTheDocument();
  expect(screen.getByText("The file is ready.")).toBeInTheDocument();
});

it("renders generated artifact cards and opens them on click", () => {
  const openGeneratedArtifact = vi.fn();
  render(
    <ConversationMessageList
      messages={[
        {
          id: "assistant-artifact",
          role: "assistant",
          status: "completed",
          content: "Report is ready.",
          source: {
            schemaVersion: 1,
            generatedArtifacts: [
              {
                path: "/workspace/report.pdf",
                name: "report.pdf",
                mediaType: "application/pdf",
                sizeBytes: 1024,
                kind: "pdf",
              },
            ],
          },
        },
      ]}
      labels={{
        messages: "Messages",
        messageIndex: "Message index",
        jumpToMessage: (index, preview) => `${index}: ${preview}`,
        tool: "Tool",
        generating: "Generating",
      }}
      onOpenGeneratedArtifact={openGeneratedArtifact}
    />,
  );

  const card = screen.getByRole("button", { name: "打开 report.pdf" });
  expect(screen.getByText("PDF")).toBeInTheDocument();
  expect(screen.getByText("1 KB")).toBeInTheDocument();
  fireEvent.click(card);
  expect(openGeneratedArtifact).toHaveBeenCalledWith(
    "assistant-artifact",
    "/workspace/report.pdf",
  );
});

it("renders every generated artifact when the collection spans multiple rows", () => {
  const openGeneratedArtifact = vi.fn();
  render(
    <ConversationMessageList
      messages={[
        {
          id: "assistant-artifacts",
          role: "assistant",
          status: "completed",
          content: "Files are ready.",
          source: {
            schemaVersion: 1,
            generatedArtifacts: [
              {
                path: "/workspace/report.docx",
                name: "report.docx",
                mediaType:
                  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                sizeBytes: 2048,
                kind: "docx",
              },
              {
                path: "/workspace/report.pdf",
                name: "report.pdf",
                mediaType: "application/pdf",
                sizeBytes: 3072,
                kind: "pdf",
              },
              {
                path: "/workspace/notes.md",
                name: "notes.md",
                mediaType: "text/markdown",
                sizeBytes: 1024,
                kind: "md",
              },
            ],
          },
        },
      ]}
      labels={{
        messages: "Messages",
        messageIndex: "Message index",
        jumpToMessage: (index, preview) => `${index}: ${preview}`,
        tool: "Tool",
        generating: "Generating",
      }}
      onOpenGeneratedArtifact={openGeneratedArtifact}
    />,
  );

  const cards = [
    screen.getByRole("button", { name: "打开 report.docx" }),
    screen.getByRole("button", { name: "打开 report.pdf" }),
    screen.getByRole("button", { name: "打开 notes.md" }),
  ];
  expect(cards).toHaveLength(3);
  fireEvent.click(cards[2]);
  expect(openGeneratedArtifact).toHaveBeenCalledWith(
    "assistant-artifacts",
    "/workspace/notes.md",
  );
});

it("keeps a generated artifact disabled while it is being opened", async () => {
  const opening = deferred<void>();
  const openGeneratedArtifact = vi.fn(() => opening.promise);
  render(
    <ConversationMessageList
      messages={[
        {
          id: "assistant-artifact",
          role: "assistant",
          status: "completed",
          content: "Report is ready.",
          source: {
            schemaVersion: 1,
            generatedArtifacts: [
              {
                path: "/workspace/report.pdf",
                name: "report.pdf",
                mediaType: "application/pdf",
                sizeBytes: 1024,
                kind: "pdf",
              },
            ],
          },
        },
      ]}
      labels={{
        messages: "Messages",
        messageIndex: "Message index",
        jumpToMessage: (index, preview) => `${index}: ${preview}`,
        tool: "Tool",
        generating: "Generating",
      }}
      onOpenGeneratedArtifact={openGeneratedArtifact}
    />,
  );

  const card = screen.getByRole("button", { name: "打开 report.pdf" });
  fireEvent.click(card);
  fireEvent.click(card);

  expect(openGeneratedArtifact).toHaveBeenCalledTimes(1);
  expect(card).toBeDisabled();

  await act(async () => opening.resolve());
  expect(card).not.toBeDisabled();
});

it("keeps 1,000 messages and their index at a visible-window DOM size", async () => {
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(
    120_000,
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    right: 900,
    bottom: 600,
    left: 0,
    width: 900,
    height: 600,
    toJSON: () => undefined,
  });

  render(
    <ConversationMessageList
      messages={Array.from({ length: 1_000 }, (_, index) => ({
        id: `message-${index}`,
        role: (index % 2 === 0 ? "user" : "assistant") as
          | "user"
          | "assistant",
        status: "completed" as const,
        content: `Message ${index + 1}`,
      }))}
      labels={{
        messages: "Messages",
        messageIndex: "Message index",
        jumpToMessage: (index, preview) => `${index}: ${preview}`,
        tool: "Tool",
        generating: "Generating",
      }}
    />,
  );

  await waitFor(() => {
    expect(document.querySelectorAll(".chat-message").length).toBeLessThan(80);
    expect(
      document.querySelectorAll(".chat-message-index-dot").length,
    ).toBeLessThan(40);
  });
});

it("does not force a user who scrolled up back to the bottom during streaming", () => {
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(640);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(320);

  const view = render(messageList());
  const scroll = view.container.querySelector<HTMLElement>(
    ".chat-session-scroll",
  );
  if (!scroll) throw new Error("Expected the conversation scroll container");

  scroll.scrollTop = 80;
  fireEvent.scroll(scroll);
  view.rerender(
    <ConversationMessageList
      messages={[
        ...messages,
        {
          id: "assistant-2",
          role: "assistant",
          status: "pending",
          content: "Streaming",
        },
      ]}
      labels={{
        messages: "Messages",
        messageIndex: "Message index",
        jumpToMessage: (index, preview) => `${index}: ${preview}`,
        tool: "Tool",
        generating: "Generating",
      }}
    />,
  );

  expect(scroll.scrollTop).toBe(80);
});

it("selects and reveals the latest message index after sending a new message", async () => {
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(960);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(320);
  const scrollIntoView = vi.fn();
  const previousScrollIntoView = Element.prototype.scrollIntoView;
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView,
  });

  try {
    const view = render(messageList());
    const scroll = view.container.querySelector<HTMLElement>(
      ".chat-session-scroll",
    );
    if (!scroll) throw new Error("Expected the conversation scroll container");

    scroll.scrollTop = 80;
    fireEvent.scroll(scroll);

    view.rerender(
      <ConversationMessageList
        messages={[
          ...messages,
          {
            id: "user-2",
            role: "user",
            status: "completed",
            content: "New question",
          },
        ]}
        labels={{
          messages: "Messages",
          messageIndex: "Message index",
          jumpToMessage: (index, preview) => `${index}: ${preview}`,
          tool: "Tool",
          generating: "Generating",
        }}
      />,
    );

    await waitFor(() => {
      expect(scroll.scrollTop).toBe(960);
      expect(
        screen.getByRole("button", { name: "2: New question" }),
      ).toHaveAttribute("aria-current", "true");
    });
    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      inline: "nearest",
    });
  } finally {
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: previousScrollIntoView,
    });
  }
});
