import {
  type ReactNode,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { AssistantTurnProjection } from "../../../domain/assistant-turn";
import { RealmFlowLogo } from "../../components/RealmFlowLogo";
import { getProgrammaticScrollBehavior } from "../../components/ui";
import { useWorkspacePageActive } from "../navigation/WorkspaceRouteCache";
import { AssistantExecutionTimeline } from "./AssistantExecutionTimeline";
import { StreamingMessageContent } from "./StreamingMessageContent";
import type {
  ConversationGeneratedArtifact,
  ConversationMessageSource,
} from "../../../domain/follow-up-suggestion";

export type ConversationMessageListItem = {
  id: string;
  role?: "user" | "assistant" | "tool";
  status?: "pending" | "completed" | "failed";
  content: string;
  error?: string;
  execution?: AssistantTurnProjection;
  source?: ConversationMessageSource;
};

type ConversationMessageListLabels = {
  messages: string;
  messageIndex: string;
  jumpToMessage: (index: number, preview: string) => string;
  tool: string;
  generating: string;
};

type ConversationMessageListProps<
  TMessage extends ConversationMessageListItem,
> = {
  messages: readonly TMessage[];
  labels: ConversationMessageListLabels;
  className?: string;
  renderFooter?: (message: TMessage, index: number) => ReactNode;
  selection?: ConversationMessageSelection;
  onOpenGeneratedArtifact?: (messageId: string, path: string) => void | Promise<void>;
};

export type ConversationMessageSelection = {
  eligibleIds: readonly string[];
  selectedIds: readonly string[];
  selectLabel: (preview: string) => string;
  onToggle: (messageId: string) => void;
};

function getMessagePreview(content: string): string {
  const preview = content.replace(/\s+/g, " ").trim();
  return preview.length > 80 ? `${preview.slice(0, 80)}...` : preview;
}

const COMPLEX_LIST_THRESHOLD = 50;
const MESSAGE_INDEX_WINDOW = 12;

export function ConversationMessageList<
  TMessage extends ConversationMessageListItem,
>({
  messages,
  labels,
  className,
  renderFooter,
  selection,
  onOpenGeneratedArtifact,
}: ConversationMessageListProps<TMessage>): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null);
  const userMessageRefs = useRef(new Map<string, HTMLElement>());
  const indexDotRefs = useRef(new Map<string, HTMLButtonElement>());
  const followingBottomRef = useRef(true);
  const pageWasActiveRef = useRef(false);
  const initializedRef = useRef(false);
  const lastUserMessageIdRef = useRef("");
  const [activeUserMessageId, setActiveUserMessageId] = useState("");
  const pageActive = useWorkspacePageActive();
  const userMessages = useMemo(
    () =>
      messages.flatMap((message, messageIndex) =>
        message.role === "user" ? [{ message, messageIndex }] : [],
      ),
    [messages],
  );
  const virtualized = messages.length > COMPLEX_LIST_THRESHOLD;
  const messageVirtualizer = useVirtualizer({
    count: messages.length,
    enabled: virtualized,
    getScrollElement: () =>
      selection
        ? scrollRef.current?.closest<HTMLElement>("[data-dialog-scroll='true']") ??
          null
        : scrollRef.current,
    getItemKey: (index) => messages[index]?.id ?? index,
    estimateSize: (index) =>
      (messages[index]?.role ?? "user") === "assistant" ? 180 : 96,
    overscan: 6,
    initialRect: { width: 900, height: 600 },
  });
  const activeUserIndex = Math.max(
    0,
    userMessages.findIndex(({ message }) => message.id === activeUserMessageId),
  );
  const indexedUserMessages =
    userMessages.length <= COMPLEX_LIST_THRESHOLD
      ? userMessages
      : userMessages.filter(
          (_, index) =>
            index === 0 ||
            index === userMessages.length - 1 ||
            Math.abs(index - activeUserIndex) <= MESSAGE_INDEX_WINDOW,
        );

  useLayoutEffect(() => {
    if (!pageActive) {
      pageWasActiveRef.current = false;
      return;
    }
    const scroll = scrollRef.current;
    if (!scroll) return;
    const latestUserMessageId = userMessages.at(-1)?.message.id ?? "";
    const latestMessageIsUser = messages.at(-1)?.role === "user";
    const userMessageAppended =
      initializedRef.current &&
      latestMessageIsUser &&
      latestUserMessageId !== "" &&
      latestUserMessageId !== lastUserMessageIdRef.current;
    const shouldFollow =
      !initializedRef.current ||
      !pageWasActiveRef.current ||
      followingBottomRef.current ||
      userMessageAppended;
    initializedRef.current = true;
    pageWasActiveRef.current = true;
    lastUserMessageIdRef.current = latestUserMessageId;
    if (!shouldFollow) return;
    const scrollToBottom = (): void => {
      if (virtualized && messages.length > 0) {
        messageVirtualizer.scrollToIndex(messages.length - 1, {
          align: "end",
        });
      }
      scroll.scrollTop = scroll.scrollHeight;
      followingBottomRef.current = true;
    };
    scrollToBottom();
    const frame = window.requestAnimationFrame(scrollToBottom);
    setActiveUserMessageId(latestUserMessageId);
    return () => window.cancelAnimationFrame(frame);
  }, [messageVirtualizer, messages, pageActive, userMessages, virtualized]);

  useLayoutEffect(() => {
    if (!activeUserMessageId) return;
    const activeDot = indexDotRefs.current.get(activeUserMessageId);
    if (typeof activeDot?.scrollIntoView !== "function") return;
    activeDot.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
  }, [activeUserMessageId, indexedUserMessages]);

  const updateActiveUserMessage = (): void => {
    const scroll = scrollRef.current;
    if (!scroll || userMessages.length === 0) return;
    const atBottom =
      scroll.scrollHeight > scroll.clientHeight &&
      scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 1;
    followingBottomRef.current = atBottom;
    if (atBottom) {
      setActiveUserMessageId(userMessages.at(-1)?.message.id ?? "");
      return;
    }

    const activationLine =
      scroll.scrollTop + Math.min(scroll.clientHeight * 0.25, 120);
    let nextActiveId = userMessages[0].message.id;
    if (virtualized) {
      for (const item of messageVirtualizer.getVirtualItems()) {
        const message = messages[item.index];
        if (!message || item.start > activationLine) break;
        if (message.role === "user") nextActiveId = message.id;
      }
    } else {
      for (const { message } of userMessages) {
        const element = userMessageRefs.current.get(message.id);
        if (!element || element.offsetTop > activationLine) break;
        nextActiveId = message.id;
      }
    }
    setActiveUserMessageId(nextActiveId);
  };

  const renderMessage = (message: TMessage, index: number): JSX.Element => {
    const role = message.role ?? "user";
    const status = message.status ?? "completed";
    const footer = renderFooter?.(message, index);
    const messageSelection = selection?.eligibleIds.includes(message.id)
      ? selection
      : undefined;
    const selected =
      messageSelection?.selectedIds.includes(message.id) ?? false;
    return (
      <article
        className={[
          "chat-message",
          role,
          status,
          selected ? "is-selected" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        ref={
          role === "user"
            ? (element) => {
                if (element) {
                  userMessageRefs.current.set(message.id, element);
                } else {
                  userMessageRefs.current.delete(message.id);
                }
              }
            : undefined
        }
      >
        {messageSelection ? (
          <label className="chat-message-selector">
            <input
              name={`conversation-message-${message.id}-selected`}
              autoComplete="off"
              type="checkbox"
              checked={messageSelection.selectedIds.includes(message.id)}
              aria-label={messageSelection.selectLabel(
                getMessagePreview(message.content),
              )}
              onChange={() => messageSelection.onToggle(message.id)}
            />
          </label>
        ) : null}
        {role === "assistant" ? (
          <div className="chat-execution-brand">
            <RealmFlowLogo
              className="chat-execution-logo"
              size={28}
              loading="lazy"
            />
            <strong>RealmFlow</strong>
          </div>
        ) : null}
        {role === "tool" ? (
          <strong className="chat-tool-label">{labels.tool}</strong>
        ) : null}
        {role === "assistant" ? (
          <div className="chat-message-assistant-body">
            <AssistantExecutionTimeline
              execution={message.execution}
              onRecoveryAction={
                message.execution?.recovery && window.realmflow?.aiRuns
                  ? async (action) => {
                      return window.realmflow!.aiRuns.recover(
                        message.execution!.runId,
                        action,
                      );
                    }
                  : undefined
              }
            />
            <StreamingMessageContent
              content={message.content}
              pending={status === "pending"}
            >
              <GeneratedArtifactCards
                artifacts={generatedArtifacts(message.source)}
                messageId={message.id}
                onOpen={onOpenGeneratedArtifact}
              />
              {footer}
            </StreamingMessageContent>
          </div>
        ) : message.content ? (
          <>
            <p className="chat-message-content">{message.content}</p>
            {footer}
          </>
        ) : null}
        {role === "assistant" &&
        status === "pending" &&
        (!message.execution || message.execution.status === "running") ? (
          <p className="chat-message-status">{labels.generating}</p>
        ) : null}
        {status === "failed" && message.error ? (
          <p className="chat-message-error" role="alert">
            {message.error}
          </p>
        ) : null}
      </article>
    );
  };

  return (
    <div
      className={[
        "conversation-message-list",
        "chat-session-scroll-shell",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {userMessages.length > 0 ? (
        <nav className="chat-message-index" aria-label={labels.messageIndex}>
          {indexedUserMessages.map(({ message, messageIndex }) => {
            const index = userMessages.findIndex(
              ({ message: candidate }) => candidate.id === message.id,
            );
            const preview = getMessagePreview(message.content);
            return (
              <button
                className="chat-message-index-dot"
                type="button"
                key={message.id}
                ref={(element) => {
                  if (element) {
                    indexDotRefs.current.set(message.id, element);
                  } else {
                    indexDotRefs.current.delete(message.id);
                  }
                }}
                aria-current={
                  activeUserMessageId === message.id ? "true" : undefined
                }
                aria-label={labels.jumpToMessage(index + 1, preview)}
                onClick={() => {
                  const behavior = getProgrammaticScrollBehavior();
                  if (virtualized) {
                    messageVirtualizer.scrollToIndex(messageIndex, {
                      align: "start",
                      behavior,
                    });
                  } else {
                    userMessageRefs.current.get(message.id)?.scrollIntoView({
                      behavior,
                      block: "start",
                    });
                  }
                  followingBottomRef.current =
                    messageIndex === messages.length - 1;
                  setActiveUserMessageId(message.id);
                }}
              >
                <span
                  className="chat-message-index-marker"
                  aria-hidden="true"
                />
                <span
                  className="chat-message-index-preview"
                  aria-hidden="true"
                  data-preview={preview}
                />
              </button>
            );
          })}
        </nav>
      ) : null}
      <div
        className="chat-session-scroll"
        ref={scrollRef}
        aria-label={labels.messages}
        onScroll={updateActiveUserMessage}
      >
        <div
          className={[
            "chat-session-messages",
            virtualized ? "is-virtualized" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          style={
            virtualized
              ? { height: `${messageVirtualizer.getTotalSize() + 80}px` }
              : undefined
          }
        >
          {virtualized
            ? messageVirtualizer.getVirtualItems().map((item) => {
                const message = messages[item.index];
                if (!message) return null;
                return (
                  <div
                    className="chat-message-virtual-row"
                    data-index={item.index}
                    key={item.key}
                    ref={messageVirtualizer.measureElement}
                    style={{ transform: `translateY(${item.start + 40}px)` }}
                  >
                    {renderMessage(message, item.index)}
                  </div>
                );
              })
            : messages.map((message, index) => (
                <div key={message.id}>{renderMessage(message, index)}</div>
              ))}
        </div>
      </div>
    </div>
  );
}

function generatedArtifacts(
  source: ConversationMessageSource | undefined,
): ConversationGeneratedArtifact[] {
  return source && "generatedArtifacts" in source
    ? source.generatedArtifacts
    : [];
}

function GeneratedArtifactCards({
  artifacts,
  messageId,
  onOpen,
}: {
  artifacts: readonly ConversationGeneratedArtifact[];
  messageId: string;
  onOpen?: (messageId: string, path: string) => void | Promise<void>;
}): JSX.Element | null {
  const [openingArtifactKey, setOpeningArtifactKey] = useState("");
  if (artifacts.length === 0) return null;
  return (
    <div className="chat-generated-artifacts">
      {artifacts.map((artifact) => {
        const artifactKey = `${artifact.path}:${artifact.name}`;
        const opening = openingArtifactKey === artifactKey;
        return (
          <button
            className="chat-generated-artifact-card"
            key={artifactKey}
            type="button"
            aria-label={`打开 ${artifact.name}`}
            disabled={opening}
            aria-busy={opening ? "true" : undefined}
            onClick={() => {
              if (!onOpen || openingArtifactKey) return;
              setOpeningArtifactKey(artifactKey);
              const result = onOpen(messageId, artifact.path);
              if (isPromiseLike(result)) {
                void result.finally(() =>
                  setOpeningArtifactKey((current) =>
                    current === artifactKey ? "" : current,
                  ),
                );
              } else {
                setOpeningArtifactKey("");
              }
            }}
          >
            <span className="chat-generated-artifact-kind">
              {artifact.kind.toUpperCase()}
            </span>
            <span className="chat-generated-artifact-name">
              {artifact.name}
            </span>
            <span className="chat-generated-artifact-size">
              {formatBytes(artifact.sizeBytes)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "finally" in value &&
    typeof value.finally === "function"
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
