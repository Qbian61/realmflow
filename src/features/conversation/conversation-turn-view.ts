import type {
  ConversationTurn,
  ConversationTurnMessage,
  ConversationTurnView,
} from "../../../domain/conversation-turn";
import type { ChatSessionMessage } from "../../domain/chat-session";

type BoundConversationMessage = Omit<ChatSessionMessage, "status"> & {
  status?: ChatSessionMessage["status"];
};

export function assembleConversationTurnViews(
  turns: readonly ConversationTurn[],
  messages: readonly BoundConversationMessage[],
): ConversationTurnView[] {
  const messagesById = new Map(messages.map((message) => [message.id, message]));
  const boundMessageIds = new Set<string>();

  const views = [...turns]
    .sort((left, right) => left.index - right.index)
    .map((turn, index, orderedTurns) => {
      const userMessage = requireBoundMessage(
        messagesById,
        turn,
        turn.userMessageId,
        "user",
      );
      const assistantMessage = requireBoundMessage(
        messagesById,
        turn,
        turn.assistantMessageId,
        "assistant",
      );
      boundMessageIds.add(userMessage.id);
      boundMessageIds.add(assistantMessage.id);

      return {
        id: turn.id,
        index: turn.index,
        status: turn.status,
        userMessage,
        assistantMessage,
        execution: assistantMessage.execution,
        isLast: index === orderedTurns.length - 1,
        isHistory: index < orderedTurns.length - 1,
      };
    });

  if (boundMessageIds.size !== messages.length) {
    throw new Error("Conversation contains messages without a Turn binding");
  }
  return views;
}

function requireBoundMessage(
  messagesById: ReadonlyMap<string, BoundConversationMessage>,
  turn: ConversationTurn,
  messageId: string,
  role: ConversationTurnMessage["role"],
): BoundConversationMessage & ConversationTurnMessage {
  const message = messagesById.get(messageId);
  if (!message) {
    throw new Error(`Conversation Turn ${turn.id} is missing its ${role} message`);
  }
  if (message.turnId !== turn.id) {
    throw new Error(`Conversation message ${message.id} has an invalid Turn binding`);
  }
  if (message.role !== role) {
    throw new Error(`Conversation Turn ${turn.id} has an invalid ${role} message`);
  }
  return {
    ...message,
    sessionId: turn.sessionId,
    status: message.status ?? "completed",
  };
}
