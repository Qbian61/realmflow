import { describe, expect, it } from "vitest";
import type { ConversationTurn } from "../../../domain/conversation-turn";
import type { ChatSessionMessage } from "../../domain/chat-session";
import { assembleConversationTurnViews } from "./conversation-turn-view";

const turn: ConversationTurn = {
  id: "turn-1",
  sessionId: "session-1",
  index: 0,
  userMessageId: "user-1",
  assistantMessageId: "assistant-1",
  status: "completed",
  createdAt: 1,
  completedAt: 2,
};

const messages: ChatSessionMessage[] = [
  {
    id: "user-1",
    turnId: "turn-1",
    role: "user",
    status: "completed",
    content: "Question",
    createdAt: 1,
  },
  {
    id: "assistant-1",
    turnId: "turn-1",
    role: "assistant",
    status: "completed",
    content: "Answer",
    createdAt: 2,
  },
];

describe("assembleConversationTurnViews", () => {
  it("assembles messages only through explicit Turn ownership", () => {
    expect(assembleConversationTurnViews([turn], messages)).toEqual([
      expect.objectContaining({
        id: "turn-1",
        userMessage: expect.objectContaining({ id: "user-1" }),
        assistantMessage: expect.objectContaining({ id: "assistant-1" }),
        isLast: true,
      }),
    ]);
  });

  it.each([
    {
      name: "missing message",
      input: messages.slice(0, 1),
      error: "missing its assistant message",
    },
    {
      name: "wrong role",
      input: [{ ...messages[0], role: "assistant" as const }, messages[1]],
      error: "invalid user message",
    },
    {
      name: "wrong Turn binding",
      input: [{ ...messages[0], turnId: "turn-other" }, messages[1]],
      error: "invalid Turn binding",
    },
    {
      name: "unbound message",
      input: [
        ...messages,
        {
          ...messages[0],
          id: "user-unbound",
          turnId: "turn-other",
        },
      ],
      error: "without a Turn binding",
    },
  ])("rejects $name instead of inferring message pairs", ({ input, error }) => {
    expect(() => assembleConversationTurnViews([turn], input)).toThrow(error);
  });
});
