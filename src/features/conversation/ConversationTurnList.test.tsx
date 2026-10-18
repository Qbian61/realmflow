import {
  act,
  fireEvent,
  render as testingRender,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ConversationTurnView } from "../../../domain/conversation-turn";
import { LocalizationProvider } from "../../localization/LocalizationProvider";
import { ConversationTurnList } from "./ConversationTurnList";

const routeActivity = vi.hoisted(() => ({ active: true }));

vi.mock("../navigation/WorkspaceRouteCache", () => ({
  useWorkspacePageActive: () => routeActivity.active,
}));

function render(element: React.ReactNode) {
  return testingRender(element, {
    wrapper: ({ children }) => (
      <LocalizationProvider>{children}</LocalizationProvider>
    ),
  });
}

function view(index: number, content = `Answer ${index + 1}`): ConversationTurnView {
  const id = `turn-${index}`;
  return {
    id,
    index,
    status: "completed",
    userMessage: {
      id: `user-${index}`,
      sessionId: "session-1",
      turnId: id,
      role: "user",
      status: "completed",
      content: `Question ${index + 1}`,
      createdAt: index * 2,
    },
    assistantMessage: {
      id: `assistant-${index}`,
      sessionId: "session-1",
      turnId: id,
      role: "assistant",
      status: "completed",
      content,
      createdAt: index * 2 + 1,
    },
    isLast: false,
    isHistory: true,
  };
}

const labels = {
  messages: "Messages",
  messageIndex: "Turn index",
  jumpToTurn: (index: number, preview: string) => `${index}: ${preview}`,
  openAttachment: (fileName: string) => `Open ${fileName}`,
  generating: "Generating",
  thinking: "Thinking",
  planningNext: "Planning next step",
};

afterEach(() => {
  routeActivity.active = true;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("keeps the user and assistant messages in one atomic Turn article", () => {
  render(<ConversationTurnList turns={[{ ...view(0), isLast: true }]} labels={labels} />);

  const turn = screen.getByRole("article");
  expect(turn).toHaveAttribute("data-turn-id", "turn-0");
  expect(turn).toContainElement(screen.getByText("Question 1"));
  expect(turn).toContainElement(screen.getByText("Answer 1"));
  expect(turn.querySelectorAll("article")).toHaveLength(0);
});

it("isolates assistant content from user content and existing message actions", () => {
  render(
    <ConversationTurnList
      turns={[{ ...view(0), isLast: true }]}
      labels={labels}
      renderFooter={(message) => (
        <button type="button">
          {message.role === "assistant" ? "Assistant action" : "User action"}
        </button>
      )}
    />,
  );

  const assistantContent = screen.getByTestId("assistant-message-content");
  const identity = screen.getByTestId("assistant-identity");
  const answer = screen.getByTestId("assistant-answer");
  expect(Array.from(assistantContent.children)).toEqual([identity, answer]);
  expect(identity).toContainElement(screen.getByText("RealmFlow"));
  expect(identity.querySelector(".chat-execution-logo")).toHaveStyle({
    width: "18px",
    height: "18px",
  });
  expect(answer).toContainElement(screen.getByText("Answer 1"));
  expect(assistantContent).not.toContainElement(screen.getByText("Question 1"));
  expect(assistantContent).not.toContainElement(
    screen.getByRole("button", { name: "Assistant action" }),
  );
  expect(screen.getByRole("button", { name: "User action" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Assistant action" })).toBeVisible();
});

it("renders image and document attachments above the user text in sending order", async () => {
  const readImage = vi
    .fn()
    .mockResolvedValue("data:image/png;base64,cG5n");
  const onOpenAttachment = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("realmflow", {
    conversationAttachments: { readImage },
  });
  const turn = {
    ...view(0),
    isLast: true,
    userMessage: {
      ...view(0).userMessage,
      attachments: [
        {
          id: "image-1",
          fileName: "wireframe.png",
          mimeType: "image/png",
          mediaKind: "image",
          sizeBytes: 1_024,
          status: "ready",
        },
        {
          id: "document-1",
          fileName: "requirements.pdf",
          mimeType: "application/pdf",
          mediaKind: "document",
          sizeBytes: 2_048,
          status: "ready",
        },
      ],
    },
  } as unknown as ConversationTurnView;

  const rendered = render(
    <ConversationTurnList
      turns={[turn]}
      labels={labels}
      onOpenAttachment={onOpenAttachment}
    />,
  );

  const attachments = rendered.container.querySelector(
    ".chat-message-user-attachments",
  );
  expect(attachments).not.toBeNull();
  expect(
    Array.from(
      attachments!.querySelectorAll<HTMLElement>("[data-attachment-id]"),
    ).map((element) => element.dataset.attachmentId),
  ).toEqual(["image-1", "document-1"]);
  expect(await screen.findByRole("img", { name: "wireframe.png" }))
    .toHaveAttribute("src", "data:image/png;base64,cG5n");
  expect(screen.getByText("requirements.pdf")).toBeVisible();
  expect(screen.getByText("PDF")).toBeVisible();
  expect(readImage).toHaveBeenCalledWith("image-1");
  fireEvent.click(screen.getByRole("button", { name: "Open wireframe.png" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Open requirements.pdf" }),
  );
  await waitFor(() => {
    expect(onOpenAttachment).toHaveBeenNthCalledWith(1, "image-1");
    expect(onOpenAttachment).toHaveBeenNthCalledWith(2, "document-1");
    expect(
      screen.getByRole("button", { name: "Open wireframe.png" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Open requirements.pdf" }),
    ).toBeEnabled();
  });

  const text = screen.getByText("Question 1");
  expect(
    attachments!.compareDocumentPosition(text) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});

it("keeps an unavailable image visible as a named fallback", async () => {
  vi.stubGlobal("realmflow", {
    conversationAttachments: {
      readImage: vi.fn().mockRejectedValue(new Error("missing blob")),
    },
  });
  const turn = {
    ...view(0),
    isLast: true,
    userMessage: {
      ...view(0).userMessage,
      attachments: [
        {
          id: "image-missing",
          fileName: "missing.png",
          mimeType: "image/png",
          mediaKind: "image",
          sizeBytes: 512,
          status: "ready",
        },
      ],
    },
  } as unknown as ConversationTurnView;

  const rendered = render(
    <ConversationTurnList turns={[turn]} labels={labels} />,
  );

  await waitFor(() => {
    expect(
      rendered.container.querySelector(
        '[data-attachment-id="image-missing"][data-preview-state="failed"]',
      ),
    ).not.toBeNull();
  });
  expect(screen.getByText("missing.png")).toBeVisible();
  expect(screen.queryByRole("img", { name: "missing.png" })).toBeNull();
});

it("shows a planning indicator while an assistant Turn is thinking", () => {
  const pendingTurn: ConversationTurnView = {
    ...view(0, ""),
    status: "running",
    isLast: true,
    isHistory: false,
    assistantMessage: {
      ...view(0).assistantMessage,
      status: "pending",
      content: "",
    },
  };

  render(<ConversationTurnList turns={[pendingTurn]} labels={labels} />);

  const status = screen.getByTestId("assistant-planning-status");
  expect(status).toHaveAttribute("aria-busy", "true");
  expect(status).toHaveTextContent("Thinking");
  expect(status).toHaveTextContent("Planning next step");
  expect(status.querySelector(".assistant-planning-shine")).not.toBeNull();
});

it("keeps 5,000 Turns and their index at a visible-window DOM size", async () => {
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(900_000);
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
    <ConversationTurnList
      turns={Array.from({ length: 5_000 }, (_, index) => ({
        ...view(index),
        isLast: index === 4_999,
      }))}
      labels={labels}
    />,
  );

  await waitFor(() => {
    expect(document.querySelectorAll(".chat-turn").length).toBeLessThan(50);
    expect(document.querySelectorAll(".chat-message-index-dot").length).toBeLessThan(40);
  });
});

it("navigates by active Turn rather than by an individual message", async () => {
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const scrollIntoView = vi.fn();
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView,
  });

  render(
    <ConversationTurnList
      turns={[view(0), { ...view(1), isLast: true }]}
      labels={labels}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "1: Question 1" }));

  await waitFor(() =>
    expect(screen.getByRole("button", { name: "1: Question 1" })).toHaveAttribute(
      "aria-current",
      "true",
    ),
  );
  expect(scrollIntoView).toHaveBeenCalledWith(
    expect.objectContaining({ block: "start" }),
  );
});

it("loads earlier Turns once at the top and preserves the reading anchor", async () => {
  let scheduledFrame: FrameRequestCallback | undefined;
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => {
      scheduledFrame = callback;
      return 1;
    }),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const loading = deferred<void>();
  const onLoadEarlier = vi.fn(() => loading.promise);
  let scrollHeight = 1_000;
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(
    () => scrollHeight,
  );
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(400);

  const turns = Array.from({ length: 15 }, (_, index) => ({
    ...view(index + 15),
    isLast: index === 14,
  }));
  const rendered = render(
    <ConversationTurnList
      turns={turns}
      labels={labels}
      hasEarlierTurns
      onLoadEarlier={onLoadEarlier}
    />,
  );
  const scroll = rendered.container.querySelector<HTMLElement>(
    ".chat-session-scroll",
  );
  if (!scroll) throw new Error("Expected the conversation scroll container");
  scroll.scrollTop = 0;

  fireEvent.scroll(scroll);
  fireEvent.scroll(scroll);
  expect(onLoadEarlier).toHaveBeenCalledOnce();

  scrollHeight = 1_600;
  await act(async () => loading.resolve());
  act(() => scheduledFrame?.(0));

  expect(scroll.scrollTop).toBe(600);
});

it("loads earlier Turns from the index and keeps persisted Turn numbers", () => {
  const onLoadEarlier = vi.fn();
  const turns = Array.from({ length: 15 }, (_, index) => ({
    ...view(index + 15),
    isLast: index === 14,
  }));

  render(
    <ConversationTurnList
      turns={turns}
      labels={labels}
      hasEarlierTurns
      onLoadEarlier={onLoadEarlier}
    />,
  );

  expect(
    screen.getByRole("button", { name: "16: Question 16" }),
  ).toBeInTheDocument();
  const index = screen.getByRole("navigation", { name: "Turn index" });
  fireEvent.wheel(index, { deltaY: -1 });
  fireEvent.wheel(index, { deltaY: -1 });

  expect(onLoadEarlier).toHaveBeenCalledOnce();
});

it("scrolls an externally targeted search result Turn into view", async () => {
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const scrollIntoView = vi.fn();
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView,
  });

  const rendered = render(
    <ConversationTurnList
      turns={[view(0), { ...view(1), isLast: true }]}
      labels={labels}
    />,
  );
  rendered.rerender(
    <ConversationTurnList
      turns={[view(0), { ...view(1), isLast: true }]}
      labels={labels}
      targetTurnId="turn-0"
    />,
  );

  await waitFor(() => {
    expect(scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ block: "start" }),
    );
    expect(screen.getByRole("button", { name: "1: Question 1" }))
      .toHaveAttribute("aria-current", "true");
  });
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

it("does not steal scroll while the current assistant Turn streams", () => {
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(900);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(320);

  const initial = {
    ...view(0, "Partial"),
    status: "running" as const,
    isLast: true,
    isHistory: false,
    assistantMessage: {
      ...view(0).assistantMessage,
      status: "pending" as const,
      content: "Partial",
    },
  };
  const rendered = render(<ConversationTurnList turns={[initial]} labels={labels} />);
  const scroll = rendered.container.querySelector<HTMLElement>(".chat-session-scroll");
  if (!scroll) throw new Error("Expected the conversation scroll container");
  scroll.scrollTop = 80;
  fireEvent.scroll(scroll);

  rendered.rerender(
    <ConversationTurnList
      turns={[
        {
          ...initial,
          assistantMessage: {
            ...initial.assistantMessage,
            content: "Partial response continued",
          },
        },
      ]}
      labels={labels}
    />,
  );

  expect(scroll.scrollTop).toBe(80);
});

it("requests measurement only for the Turn whose streamed content changed", () => {
  const onTurnMeasure = vi.fn();
  const rendered = render(
    <ConversationTurnList
      turns={[view(0), { ...view(1), isLast: true }]}
      labels={labels}
      onTurnMeasure={onTurnMeasure}
    />,
  );
  onTurnMeasure.mockClear();

  rendered.rerender(
    <ConversationTurnList
      turns={[view(0), { ...view(1, "Changed answer"), isLast: true }]}
      labels={labels}
      onTurnMeasure={onTurnMeasure}
    />,
  );

  expect(onTurnMeasure).toHaveBeenCalledTimes(1);
  expect(onTurnMeasure).toHaveBeenCalledWith("turn-1", expect.any(HTMLElement));
});
