import { Check, Copy, RefreshCw, Share2 } from "lucide-react";

type ConversationMessageFooterLabels = {
  copied: string;
  copy: string;
  copyMessage: string;
  share: string;
  retry: string;
  sentAt: (time: string) => string;
  completedAt: (time: string) => string;
  today: string;
  yesterday: string;
};

type ConversationMessageFooterProps = {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  modelName?: string;
  locale: string;
  labels: ConversationMessageFooterLabels;
  copied: boolean;
  onCopy: () => void;
  onShare?: () => void;
  onRetry?: () => void;
  retryDisabled?: boolean;
};

function isSameLocalDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function formatMessageTime(
  timestamp: number,
  locale: string,
  labels: Pick<ConversationMessageFooterLabels, "today" | "yesterday">,
): string {
  const messageDate = new Date(timestamp);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const dateLabel = isSameLocalDay(messageDate, now)
    ? labels.today
    : isSameLocalDay(messageDate, yesterday)
      ? labels.yesterday
      : new Intl.DateTimeFormat(locale, {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(messageDate);
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(timestamp);
  return `${dateLabel} ${time}`;
}

export function ConversationMessageFooter({
  role,
  content,
  timestamp,
  modelName,
  locale,
  labels,
  copied,
  onCopy,
  onShare,
  onRetry,
  retryDisabled = false,
}: ConversationMessageFooterProps): JSX.Element {
  const formattedTime = formatMessageTime(timestamp, locale, labels);
  return (
    <footer className={`chat-message-footer ${role}`}>
      {role === "user" ? (
        <time
          className="chat-message-time"
          dateTime={new Date(timestamp).toISOString()}
          aria-label={labels.sentAt(formattedTime)}
        >
          {formattedTime}
        </time>
      ) : null}
      <div className="chat-message-actions">
        {content ? (
          <button
            className="chat-message-action"
            type="button"
            aria-label={
              copied
                ? labels.copied
                : role === "user"
                  ? labels.copyMessage
                  : labels.copy
            }
            title={
              copied
                ? labels.copied
                : role === "user"
                  ? labels.copyMessage
                  : labels.copy
            }
            onClick={onCopy}
          >
            {copied ? (
              <Check size={16} aria-hidden="true" />
            ) : (
              <Copy size={16} aria-hidden="true" />
            )}
          </button>
        ) : null}
        {content && onShare ? (
          <button
            className="chat-message-action"
            type="button"
            aria-label={labels.share}
            title={labels.share}
            onClick={onShare}
          >
            <Share2 size={16} aria-hidden="true" />
          </button>
        ) : null}
        {role === "assistant" && onRetry ? (
          <button
            className="chat-message-action"
            type="button"
            aria-label={labels.retry}
            title={labels.retry}
            disabled={retryDisabled}
            onClick={onRetry}
          >
            <RefreshCw size={16} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {role === "assistant" ? (
        <span className="chat-message-assistant-meta">
          {modelName ? (
            <span className="chat-message-model" title={modelName}>
              {modelName}
            </span>
          ) : null}
          <time
            className="chat-message-time"
            dateTime={new Date(timestamp).toISOString()}
            aria-label={labels.completedAt(formattedTime)}
          >
            {formattedTime}
          </time>
        </span>
      ) : null}
    </footer>
  );
}
