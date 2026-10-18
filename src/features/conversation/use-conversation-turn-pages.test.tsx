import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ConversationTurnView } from "../../../domain/conversation-turn";
import type { ListConversationTurnsResponse } from "../../../shared/business";
import { useConversationTurnPages } from "./use-conversation-turn-pages";

afterEach(() => {
  delete window.realmflow;
});

it("ignores an older page response after switching conversations", async () => {
  const first = deferred<ListConversationTurnsResponse>();
  const second = deferred<ListConversationTurnsResponse>();
  const listConversationTurns = vi
    .fn()
    .mockImplementationOnce(() => first.promise)
    .mockImplementationOnce(() => second.promise);
  window.realmflow = {
    business: { listConversationTurns },
  } as unknown as typeof window.realmflow;

  const { result, rerender } = renderHook(
    ({
      sessionId,
      liveTurns,
    }: {
      sessionId: string;
      liveTurns: ConversationTurnView[];
    }) => useConversationTurnPages({ sessionId, liveTurns }),
    {
      initialProps: {
        sessionId: "session-1",
        liveTurns: [turn("session-1", 0)],
      },
    },
  );

  rerender({
    sessionId: "session-2",
    liveTurns: [turn("session-2", 0, "Second conversation")],
  });
  await act(async () => {
    second.resolve({
      turns: [turn("session-2", 0, "Second conversation")],
      totalCount: 1,
    });
  });
  await waitFor(() =>
    expect(result.current.turns[0]?.userMessage.content).toBe(
      "Second conversation",
    ),
  );

  await act(async () => {
    first.resolve({
      turns: [turn("session-1", 0, "Stale conversation")],
      totalCount: 1,
    });
  });

  expect(result.current.turns).toHaveLength(1);
  expect(result.current.turns[0]?.userMessage.sessionId).toBe("session-2");
  expect(result.current.turns[0]?.userMessage.content).toBe(
    "Second conversation",
  );
});

it("does not reload the initial page when live Turns update", async () => {
  const listConversationTurns = vi.fn().mockResolvedValue({
    turns: [turn("session-1", 0)],
    totalCount: 1,
  });
  window.realmflow = {
    business: { listConversationTurns },
  } as unknown as typeof window.realmflow;

  const { rerender } = renderHook(
    ({ liveTurns }: { liveTurns: ConversationTurnView[] }) =>
      useConversationTurnPages({
        sessionId: "session-1",
        liveTurns,
      }),
    {
      initialProps: {
        liveTurns: [turn("session-1", 0)],
      },
    },
  );
  await waitFor(() => expect(listConversationTurns).toHaveBeenCalledOnce());

  rerender({
    liveTurns: [
      turn("session-1", 0),
      turn("session-1", 1, "New live Turn"),
    ],
  });

  expect(listConversationTurns).toHaveBeenCalledOnce();
});

function turn(
  sessionId: string,
  index: number,
  content = `Question ${index + 1}`,
): ConversationTurnView {
  const turnId = `${sessionId}-turn-${index}`;
  return {
    id: turnId,
    index,
    status: "completed",
    userMessage: {
      id: `${turnId}-user`,
      sessionId,
      turnId,
      role: "user",
      status: "completed",
      content,
      createdAt: index * 2,
    },
    assistantMessage: {
      id: `${turnId}-assistant`,
      sessionId,
      turnId,
      role: "assistant",
      status: "completed",
      content: `Answer ${index + 1}`,
      createdAt: index * 2 + 1,
    },
    isLast: true,
    isHistory: true,
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}
