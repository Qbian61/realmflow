import { type ReactNode, useState } from "react";
import type { AssistantTurnProjection } from "../../../domain/assistant-turn";
import type { ConversationMessageAttachment } from "../../../domain/conversation-input";
import type {
  ConversationGeneratedArtifact,
  ConversationMessageSource,
} from "../../../domain/follow-up-suggestion";
import { RealmFlowLogo } from "../../components/RealmFlowLogo";
import { AssistantExecutionTimeline } from "./AssistantExecutionTimeline";
import { StreamingMessageContent } from "./StreamingMessageContent";
import { UserMessageAttachments } from "./UserMessageAttachments";

export type ConversationMessageListItem = {
  id: string;
  role?: "user" | "assistant";
  status?: "pending" | "completed" | "failed";
  content: string;
  error?: string;
  execution?: AssistantTurnProjection;
  source?: ConversationMessageSource;
  attachments?: readonly ConversationMessageAttachment[];
};

export type ConversationMessageListLabels = {
  thinking: string;
  planningNext: string;
};

export type ConversationMessageSelection = {
  eligibleIds: readonly string[];
  selectedIds: readonly string[];
  selectLabel: (preview: string) => string;
  onToggle: (messageId: string) => void;
};

export function getMessagePreview(content: string): string {
  const preview = content.replace(/\s+/g, " ").trim();
  return preview.length > 80 ? `${preview.slice(0, 80)}...` : preview;
}

export function ConversationMessageBody({
  message,
  labels,
  footer,
  onOpenAttachment,
  openAttachmentLabel,
  onOpenGeneratedArtifact,
}: {
  message: ConversationMessageListItem;
  labels: ConversationMessageListLabels;
  footer?: ReactNode;
  onOpenAttachment?: (attachmentId: string) => void | Promise<void>;
  openAttachmentLabel: (fileName: string) => string;
  onOpenGeneratedArtifact?: (messageId: string, path: string) => void | Promise<void>;
}): JSX.Element {
  const role = message.role ?? "user";
  const status = message.status ?? "completed";
  const showsPlanningStatus =
    status === "pending" &&
    role === "assistant" &&
    (!message.execution || message.execution.status === "running");
  return (
    <>
      {role === "assistant" ? (
        <div className="chat-message-assistant-body">
          <div
            className="chat-message-assistant-content"
            data-testid="assistant-message-content"
          >
            <div
              className="chat-execution-brand assistant-message-identity"
              data-testid="assistant-identity"
            >
              <RealmFlowLogo
                className="chat-execution-logo"
                size={18}
                loading="lazy"
              />
              <strong>RealmFlow</strong>
            </div>
            <AssistantExecutionTimeline
              execution={message.execution}
              onRecoveryAction={
                message.execution?.recovery && window.realmflow?.aiRuns
                  ? async (action) =>
                      window.realmflow!.aiRuns.recover(
                        message.execution!.runId,
                        action,
                      )
                  : undefined
              }
            />
            <div
              className="assistant-message-answer"
              data-testid="assistant-answer"
            >
              <StreamingMessageContent
                content={message.content}
                pending={status === "pending"}
              >
                <GeneratedArtifactCards
                  artifacts={generatedArtifacts(message.source)}
                  messageId={message.id}
                  onOpen={onOpenGeneratedArtifact}
                />
              </StreamingMessageContent>
            </div>
            {showsPlanningStatus ? (
              <AssistantPlanningStatus labels={labels} />
            ) : null}
            {status === "failed" && message.error ? (
              <p className="chat-message-error" role="alert">
                {message.error}
              </p>
            ) : null}
          </div>
          {footer}
        </div>
      ) : message.content || message.attachments?.length ? (
        <>
          <UserMessageAttachments
            attachments={message.attachments ?? []}
            onOpenAttachment={onOpenAttachment}
            openAttachmentLabel={openAttachmentLabel}
          />
          {message.content ? (
            <p className="chat-message-content">{message.content}</p>
          ) : null}
          {footer}
        </>
      ) : null}
      {role !== "assistant" && status === "failed" && message.error ? (
        <p className="chat-message-error" role="alert">
          {message.error}
        </p>
      ) : null}
    </>
  );
}

function AssistantPlanningStatus({
  labels,
}: {
  labels: ConversationMessageListLabels;
}): JSX.Element {
  return (
    <div
      className="assistant-planning-status"
      data-testid="assistant-planning-status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="assistant-planning-shine" aria-hidden="true" />
      <span className="assistant-planning-primary">{labels.thinking}</span>
      <span className="assistant-planning-secondary">{labels.planningNext}</span>
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
