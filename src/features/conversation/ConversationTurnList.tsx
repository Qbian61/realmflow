import {
  memo,
  type ReactNode,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type {
  ConversationTurnMessage,
  ConversationTurnView,
} from "../../../domain/conversation-turn";
import { getProgrammaticScrollBehavior } from "../../components/ui";
import { useWorkspacePageActive } from "../navigation/WorkspaceRouteCache";
import {
  ConversationMessageBody,
  getMessagePreview,
  type ConversationMessageListItem,
  type ConversationMessageSelection,
} from "./ConversationMessageList";

export type ConversationTurnListLabels = {
  messages: string;
  messageIndex: string;
  jumpToTurn: (index: number, preview: string) => string;
  openAttachment: (fileName: string) => string;
  thinking: string;
  planningNext: string;
};

type Props = {
  turns: readonly ConversationTurnView[];
  labels: ConversationTurnListLabels;
  className?: string;
  renderFooter?: (
    message: ConversationTurnMessage,
    turn: ConversationTurnView,
  ) => ReactNode;
  selection?: ConversationMessageSelection;
  targetTurnId?: string;
  hasEarlierTurns?: boolean;
  loadingEarlierTurns?: boolean;
  onLoadEarlier?: () => void | Promise<void>;
  onOpenAttachment?: (attachmentId: string) => void | Promise<void>;
  onOpenGeneratedArtifact?: (messageId: string, path: string) => void | Promise<void>;
  onTurnMeasure?: (turnId: string, element: HTMLElement) => void;
};

const VIRTUALIZATION_THRESHOLD = 40;
const INDEX_WINDOW = 12;
const LOAD_EARLIER_THRESHOLD_PX = 48;

export function ConversationTurnList({
  turns,
  labels,
  className,
  renderFooter,
  selection,
  targetTurnId,
  hasEarlierTurns = false,
  loadingEarlierTurns = false,
  onLoadEarlier,
  onOpenAttachment,
  onOpenGeneratedArtifact,
  onTurnMeasure,
}: Props): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null);
  const turnRefs = useRef(new Map<string, HTMLElement>());
  const indexDotRefs = useRef(new Map<string, HTMLButtonElement>());
  const followingBottomRef = useRef(true);
  const initializedRef = useRef(false);
  const pageWasActiveRef = useRef(false);
  const lastTurnIdRef = useRef("");
  const loadEarlierPendingRef = useRef(false);
  const [activeTurnId, setActiveTurnId] = useState("");
  const pageActive = useWorkspacePageActive();
  const virtualized = turns.length > VIRTUALIZATION_THRESHOLD;
  const virtualizer = useVirtualizer({
    count: turns.length,
    enabled: virtualized,
    getScrollElement: () =>
      selection
        ? scrollRef.current?.closest<HTMLElement>("[data-dialog-scroll='true']") ??
          null
        : scrollRef.current,
    getItemKey: (index) => turns[index]?.id ?? index,
    estimateSize: () => 300,
    overscan: 5,
    initialRect: { width: 900, height: 600 },
  });
  const activeIndex = Math.max(
    0,
    turns.findIndex((turn) => turn.id === activeTurnId),
  );
  const indexedTurns = useMemo(
    () =>
      turns.length <= VIRTUALIZATION_THRESHOLD
        ? turns
        : turns.filter(
            (_, index) =>
              index === 0 ||
              index === turns.length - 1 ||
              Math.abs(index - activeIndex) <= INDEX_WINDOW,
          ),
    [activeIndex, turns],
  );

  useLayoutEffect(() => {
    if (!pageActive) {
      pageWasActiveRef.current = false;
      return;
    }
    const scroll = scrollRef.current;
    if (!scroll) return;
    const latestTurnId = turns.at(-1)?.id ?? "";
    const turnAppended =
      initializedRef.current &&
      latestTurnId !== "" &&
      latestTurnId !== lastTurnIdRef.current;
    const shouldFollow =
      !initializedRef.current ||
      !pageWasActiveRef.current ||
      followingBottomRef.current ||
      turnAppended;
    initializedRef.current = true;
    pageWasActiveRef.current = true;
    lastTurnIdRef.current = latestTurnId;
    if (!shouldFollow) return;
    const scrollToBottom = (): void => {
      if (virtualized && turns.length > 0) {
        virtualizer.scrollToIndex(turns.length - 1, { align: "end" });
      }
      scroll.scrollTop = scroll.scrollHeight;
      followingBottomRef.current = true;
    };
    scrollToBottom();
    const frame = window.requestAnimationFrame(scrollToBottom);
    setActiveTurnId(latestTurnId);
    return () => window.cancelAnimationFrame(frame);
  }, [pageActive, turns, virtualized, virtualizer]);

  useLayoutEffect(() => {
    const activeDot = indexDotRefs.current.get(activeTurnId);
    activeDot?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [activeTurnId, indexedTurns]);

  useLayoutEffect(() => {
    if (!targetTurnId) return;
    const targetIndex = turns.findIndex(({ id }) => id === targetTurnId);
    if (targetIndex < 0) return;
    const behavior = getProgrammaticScrollBehavior();
    if (virtualized) {
      virtualizer.scrollToIndex(targetIndex, { align: "start", behavior });
    } else {
      const target = turnRefs.current.get(targetTurnId);
      if (typeof target?.scrollIntoView === "function") {
        target.scrollIntoView({
          behavior,
          block: "start",
        });
      }
    }
    followingBottomRef.current = targetIndex === turns.length - 1;
    setActiveTurnId(targetTurnId);
  }, [targetTurnId, turns, virtualized, virtualizer]);

  const updateActiveTurn = (): void => {
    const scroll = scrollRef.current;
    if (!scroll || turns.length === 0) return;
    const atBottom =
      scroll.scrollHeight > scroll.clientHeight &&
      scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 1;
    followingBottomRef.current = atBottom;
    if (atBottom) {
      setActiveTurnId(turns.at(-1)?.id ?? "");
      return;
    }
    const activationLine =
      scroll.scrollTop + Math.min(scroll.clientHeight * 0.25, 120);
    let nextActiveId = turns[0].id;
    if (virtualized) {
      for (const item of virtualizer.getVirtualItems()) {
        const turn = turns[item.index];
        if (!turn || item.start > activationLine) break;
        nextActiveId = turn.id;
      }
    } else {
      for (const turn of turns) {
        const element = turnRefs.current.get(turn.id);
        if (!element || element.offsetTop > activationLine) break;
        nextActiveId = turn.id;
      }
    }
    setActiveTurnId(nextActiveId);
  };

  const loadEarlierTurns = (): void => {
    const scroll = scrollRef.current;
    if (
      !scroll ||
      !hasEarlierTurns ||
      loadingEarlierTurns ||
      !onLoadEarlier ||
      loadEarlierPendingRef.current
    ) {
      return;
    }
    loadEarlierPendingRef.current = true;
    const previousHeight = scroll.scrollHeight;
    const previousTop = scroll.scrollTop;
    void Promise.resolve(onLoadEarlier())
      .catch(() => undefined)
      .then(() => {
        window.requestAnimationFrame(() => {
          const nextScroll = scrollRef.current;
          if (nextScroll) {
            nextScroll.scrollTop =
              previousTop +
              Math.max(0, nextScroll.scrollHeight - previousHeight);
            updateActiveTurn();
          }
          loadEarlierPendingRef.current = false;
        });
      });
  };

  const row = (turn: ConversationTurnView): JSX.Element => (
    <ConversationTurnRow
      turn={turn}
      labels={labels}
      renderFooter={renderFooter}
      selection={selection}
      onOpenAttachment={onOpenAttachment}
      onOpenGeneratedArtifact={onOpenGeneratedArtifact}
      onMeasure={onTurnMeasure}
      register={(element) => {
        if (element) turnRefs.current.set(turn.id, element);
        else turnRefs.current.delete(turn.id);
      }}
    />
  );

  return (
    <div
      className={["conversation-message-list", "chat-session-scroll-shell", className]
        .filter(Boolean)
        .join(" ")}
    >
      {turns.length > 0 ? (
        <nav
          className="chat-message-index"
          aria-label={labels.messageIndex}
          aria-busy={loadingEarlierTurns}
          onScroll={(event) => {
            if (
              event.currentTarget.scrollTop <= LOAD_EARLIER_THRESHOLD_PX
            ) {
              loadEarlierTurns();
            }
          }}
          onWheel={(event) => {
            if (
              event.deltaY < 0 &&
              event.currentTarget.scrollTop <= LOAD_EARLIER_THRESHOLD_PX
            ) {
              loadEarlierTurns();
            }
          }}
        >
          {indexedTurns.map((turn) => {
            const index = turns.findIndex(({ id }) => id === turn.id);
            const preview = getMessagePreview(turn.userMessage.content);
            return (
              <button
                className="chat-message-index-dot"
                type="button"
                key={turn.id}
                ref={(element) => {
                  if (element) indexDotRefs.current.set(turn.id, element);
                  else indexDotRefs.current.delete(turn.id);
                }}
                aria-current={activeTurnId === turn.id ? "true" : undefined}
                aria-label={labels.jumpToTurn(turn.index + 1, preview)}
                onClick={() => {
                  const behavior = getProgrammaticScrollBehavior();
                  if (virtualized) {
                    virtualizer.scrollToIndex(index, { align: "start", behavior });
                  } else {
                    turnRefs.current.get(turn.id)?.scrollIntoView({
                      behavior,
                      block: "start",
                    });
                  }
                  followingBottomRef.current = index === turns.length - 1;
                  setActiveTurnId(turn.id);
                }}
              >
                <span className="chat-message-index-marker" aria-hidden="true" />
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
        onScroll={() => {
          updateActiveTurn();
          if (
            scrollRef.current &&
            scrollRef.current.scrollTop <= LOAD_EARLIER_THRESHOLD_PX
          ) {
            loadEarlierTurns();
          }
        }}
      >
        <div
          className={["chat-session-messages", virtualized ? "is-virtualized" : ""]
            .filter(Boolean)
            .join(" ")}
          style={
            virtualized ? { height: `${virtualizer.getTotalSize() + 80}px` } : undefined
          }
        >
          {virtualized
            ? virtualizer.getVirtualItems().map((item) => {
                const turn = turns[item.index];
                return turn ? (
                  <div
                    className="chat-turn-virtual-row"
                    data-index={item.index}
                    key={item.key}
                    ref={virtualizer.measureElement}
                    style={{ transform: `translateY(${item.start + 40}px)` }}
                  >
                    {row(turn)}
                  </div>
                ) : null;
              })
            : turns.map((turn) => <div key={turn.id}>{row(turn)}</div>)}
        </div>
      </div>
    </div>
  );
}

const ConversationTurnRow = memo(function ConversationTurnRow({
  turn,
  labels,
  renderFooter,
  selection,
  onOpenAttachment,
  onOpenGeneratedArtifact,
  onMeasure,
  register,
}: {
  turn: ConversationTurnView;
  labels: ConversationTurnListLabels;
  renderFooter?: Props["renderFooter"];
  selection?: ConversationMessageSelection;
  onOpenAttachment?: Props["onOpenAttachment"];
  onOpenGeneratedArtifact?: Props["onOpenGeneratedArtifact"];
  onMeasure?: Props["onTurnMeasure"];
  register: (element: HTMLElement | null) => void;
}): JSX.Element {
  const rowRef = useRef<HTMLElement | null>(null);
  const attachmentRevision =
    turn.userMessage.attachments
      ?.map((attachment) => `${attachment.id}:${attachment.status}`)
      .join(",") ?? "";
  const revision = `${turn.status}\0${turn.userMessage.content}\0${attachmentRevision}\0${turn.assistantMessage.content}\0${turn.execution?.lastSequence ?? -1}`;
  const mountedRef = useRef(false);

  useLayoutEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (rowRef.current) onMeasure?.(turn.id, rowRef.current);
  }, [onMeasure, revision, turn.id]);

  const selected =
    selection?.selectedIds.includes(turn.userMessage.id) ||
    selection?.selectedIds.includes(turn.assistantMessage.id);
  return (
    <article
      className={["chat-turn", selected ? "is-selected" : ""].filter(Boolean).join(" ")}
      data-turn-id={turn.id}
      ref={(element) => {
        rowRef.current = element;
        register(element);
      }}
    >
      <TurnMessage
        message={turn.userMessage}
        turn={turn}
        labels={labels}
        footer={renderFooter?.(turn.userMessage, turn)}
        selection={selection}
        onOpenAttachment={onOpenAttachment}
      />
      <TurnMessage
        message={{ ...turn.assistantMessage, execution: turn.execution }}
        turn={turn}
        labels={labels}
        footer={renderFooter?.(turn.assistantMessage, turn)}
        selection={selection}
        onOpenGeneratedArtifact={onOpenGeneratedArtifact}
      />
    </article>
  );
});

function TurnMessage({
  message,
  labels,
  footer,
  selection,
  onOpenAttachment,
  onOpenGeneratedArtifact,
}: {
  message: ConversationTurnMessage & ConversationMessageListItem;
  turn: ConversationTurnView;
  labels: ConversationTurnListLabels;
  footer?: ReactNode;
  selection?: ConversationMessageSelection;
  onOpenAttachment?: Props["onOpenAttachment"];
  onOpenGeneratedArtifact?: Props["onOpenGeneratedArtifact"];
}): JSX.Element {
  const selectable = selection?.eligibleIds.includes(message.id) ?? false;
  const selected = selection?.selectedIds.includes(message.id) ?? false;
  return (
    <div
      className={[
        "chat-message",
        message.role,
        message.status,
        selected ? "is-selected" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {selectable && selection ? (
        <label className="chat-message-selector">
          <input
            name={`conversation-message-${message.id}-selected`}
            autoComplete="off"
            type="checkbox"
            checked={selected}
            aria-label={selection.selectLabel(getMessagePreview(message.content))}
            onChange={() => selection.onToggle(message.id)}
          />
        </label>
      ) : null}
      <ConversationMessageBody
        message={message}
        labels={{
          thinking: labels.thinking,
          planningNext: labels.planningNext,
        }}
        footer={footer}
        onOpenAttachment={onOpenAttachment}
        openAttachmentLabel={labels.openAttachment}
        onOpenGeneratedArtifact={onOpenGeneratedArtifact}
      />
    </div>
  );
}
