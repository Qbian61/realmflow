import type { RefObject } from "react";
import { RealmFlowLogo } from "../../components/RealmFlowLogo";
import type { ConversationMessageListItem } from "./ConversationMessageList";
import { StreamingMessageContent } from "./StreamingMessageContent";

export type ShareableConversationMessage = ConversationMessageListItem & {
  createdAt: number;
  modelName?: string;
};

type Props = {
  captureRef: RefObject<HTMLDivElement>;
  title: string;
  messages: readonly ShareableConversationMessage[];
  locale: string;
  aiDisclaimer: string;
};

export function ConversationShareCard({
  captureRef,
  title,
  messages,
  locale,
  aiDisclaimer,
}: Props): JSX.Element {
  const date = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(Date.now());

  return (
    <div className="conversation-share-card" ref={captureRef}>
      <header>
        <span className="conversation-share-card-brand">
          <RealmFlowLogo size={28} />
          <strong>RealmFlow</strong>
        </span>
        <h1>{title}</h1>
        <p>
          {date} · {aiDisclaimer}
        </p>
      </header>
      <div className="conversation-share-card-messages">
        {messages.map((message) => (
          <article className={message.role ?? "user"} key={message.id}>
            {message.role === "assistant" ? (
              <div className="conversation-share-card-author">
                <RealmFlowLogo size={28} />
                <div>
                  <strong>RealmFlow</strong>
                  {message.modelName ? <span>{message.modelName}</span> : null}
                </div>
              </div>
            ) : null}
            {message.role === "assistant" ? (
              <StreamingMessageContent
                content={message.content}
                pending={false}
              />
            ) : (
              <p>{message.content}</p>
            )}
          </article>
        ))}
      </div>
      <footer>
        <RealmFlowLogo size={28} />
        <div>
          <strong>RealmFlow</strong>
          <span>Local-first AI workflow</span>
        </div>
      </footer>
    </div>
  );
}
