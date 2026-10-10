import { useRef, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { Composer } from "../components/Composer";
import { Toolbar } from "../components/ui";
import type { ChatSession } from "../domain/chat-session";
import type { WorkspaceSpace } from "../domain/workspace";
import { useModelProfiles } from "../app/hooks/use-model-profiles";
import { ConversationMessageFooter } from "../features/conversation/ConversationMessageFooter";
import { ConversationMessageList } from "../features/conversation/ConversationMessageList";
import { FollowUpSuggestionList } from "../features/conversation/FollowUpSuggestionList";
import { ConversationShareController } from "../features/conversation/ConversationShareController";
import { KnowledgeNoteCapture } from "../features/conversation/KnowledgeNoteCapture";
import { WorkspaceHeaderPortal } from "../features/navigation/WorkspaceLayout";
import { useToast } from "../features/toast/ToastProvider";
import { useOptionalWorkbench } from "../features/workbench/WorkbenchProvider";
import { useLocalization } from "../localization/LocalizationProvider";
import type { ReasoningPreference } from "../../domain/reasoning-router";
import type { ConversationAttachmentDescriptor } from "../../domain/conversation-input";
import type { ConversationAttachmentSubmission } from "../../shared/conversation-attachments";

type ChatSessionPageProps = {
  sessions: ChatSession[];
  spaces: WorkspaceSpace[];
  loading?: boolean;
  onAppendMessage: (
    sessionId: string,
    content: string,
    modelProfileId?: string,
    reasoningMode?: ReasoningPreference,
    attachments?: ConversationAttachmentSubmission,
  ) => void | Promise<void>;
  onSendFollowUpSuggestion?: (command: {
    sessionId: string;
    suggestionSetId: string;
    suggestionId: string;
    expectedSessionRevision: number;
    expectedSuggestionRevision: number;
    applicationLocale?: "zh-CN" | "en" | "ja";
  }) => void | Promise<void>;
};

export default function ChatSessionPage({
  sessions,
  spaces,
  loading = false,
  onAppendMessage,
  onSendFollowUpSuggestion,
}: ChatSessionPageProps): JSX.Element {
  const { locale, t } = useLocalization();
  const toast = useToast();
  const workbench = useOptionalWorkbench();
  const { sessionId } = useParams();
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const draftId = useRef(crypto.randomUUID());
  const [attachments, setAttachments] = useState<
    ConversationAttachmentDescriptor[]
  >([]);
  const [attachmentErrors, setAttachmentErrors] = useState<
    Array<{ fileName: string; message: string }>
  >([]);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [allowImageEgress, setAllowImageEgress] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState("");
  const [sendingSuggestionSetId, setSendingSuggestionSetId] = useState("");
  const [cancellingRunId, setCancellingRunId] = useState("");
  const session = sessions.find((item) => item.id === sessionId);
  const models = useModelProfiles(session?.modelProfileId);

  if (!session) {
    return loading ? (
      <div
        className="chat-session-loading"
        aria-busy="true"
        aria-label={t("chat.loadingAria")}
      >
        <h1 className="sr-only">{t("chat.loading")}</h1>
        <p>{t("chat.loading")}</p>
      </div>
    ) : (
      <Navigate to="/chat/new" replace />
    );
  }

  const space = spaces.find((item) => item.path === session.spacePath);
  const contextLabel =
    session.knowledgeScope?.kind === "all_workspaces"
      ? t("chat.knowledgeAll")
      : session.knowledgeScope?.kind === "none"
        ? session.folderPath
          ? t("chat.knowledgeFolder", {
              name:
                session.folderPath.split(/[\\/]/).filter(Boolean).at(-1) ??
                t("chat.local"),
            })
          : t("chat.knowledgeNone")
        : space?.label ?? t("chat.local");
  const activeRunId = [...session.messages]
    .reverse()
    .find(
      (message) =>
        message.role === "assistant" &&
        message.status === "pending" &&
        Boolean(message.runId),
    )?.runId;

  const submitContent = async (
    rawContent: string,
    clearPrompt: boolean,
    includeAttachments = false,
  ): Promise<void> => {
    const content = rawContent.trim();
    if (!content || submitting || activeRunId) return;
    setSubmitting(true);
    try {
      const submission =
        includeAttachments && attachments.length > 0
          ? {
              draftId: draftId.current,
              attachmentIds: attachments.map(({ id }) => id),
              allowImageEgress,
            }
          : undefined;
      if (submission) {
        await onAppendMessage(
          session.id,
          content,
          models.selectedId || undefined,
          "auto",
          submission,
        );
      } else {
        await onAppendMessage(
          session.id,
          content,
          models.selectedId || undefined,
          "auto",
        );
      }
      if (clearPrompt) {
        setPrompt("");
        setAttachments([]);
        setAttachmentErrors([]);
        setAllowImageEgress(false);
        draftId.current = crypto.randomUUID();
      }
    } catch {
      toast.error("chat.sendFailed");
    } finally {
      setSubmitting(false);
    }
  };

  const latestAssistantIndex = session.messages
    .map((message) => message.role === "assistant")
    .lastIndexOf(true);
  const openGeneratedArtifact = async (
    messageId: string,
    path: string,
  ): Promise<void> => {
    const api = window.realmflow?.workspace;
    if (!api || !workbench) return;
    try {
      const selection = await api.openSessionFiles([path]);
      if (selection.files.length === 0) {
        throw new Error("Generated artifact selection was empty");
      }
      workbench.openWorkspaceSelection(selection);
    } catch (error) {
      const messageKey = artifactOpenFailureMessageKey(error);
      toast.error(messageKey, {
        dedupeKey: `${messageKey}:${messageId}:${path}`,
      });
    }
  };

  return (
    <>
      <WorkspaceHeaderPortal>
        <Toolbar
          variant="workspace-header"
          className="chat-session-header"
          aria-label={session.title}
        >
          <div className="chat-session-header-title">
            <h1 className="chat-session-title-text" title={session.title}>
              {session.title}
            </h1>
            <p className="chat-session-subtitle-text">
              {contextLabel} · {t("chat.verifyAi")}
            </p>
          </div>
        </Toolbar>
      </WorkspaceHeaderPortal>
      <div className="chat-session-page">
        <ConversationShareController
          title={session.title}
          messages={session.messages}
        >
          {(shareMessage) => (
            <KnowledgeNoteCapture
              business={window.realmflow?.business}
              workspaceId={session.workspaceId}
              sessionId={session.id}
              messages={session.messages}
            >
              {(selection) => (
                <ConversationMessageList
                  messages={session.messages}
                  selection={selection}
                  labels={{
                    messages: t("chat.messages"),
                    messageIndex: t("chat.messageIndex"),
                    jumpToMessage: (index, preview) =>
                      t("chat.jumpToMessage", { index, preview }),
                    tool: t("chat.tool"),
                    generating: t("chat.generating"),
                  }}
                  onOpenGeneratedArtifact={openGeneratedArtifact}
                  renderFooter={(message, messageIndex) => {
                    if (
                      (message.role !== "user" &&
                        message.role !== "assistant") ||
                      message.status === "pending"
                    ) {
                      return null;
                    }
                    const retryContent =
                      message.role === "assistant"
                        ? session.messages
                            .slice(0, messageIndex)
                            .reverse()
                            .find((item) => item.role === "user")?.content
                        : undefined;
                    const messageTimestamp =
                      message.role === "assistant"
                        ? (message.completedAt ?? message.createdAt)
                        : message.createdAt;
                    return (
                      <>
                        <ConversationMessageFooter
                        role={message.role}
                        content={message.content}
                        timestamp={messageTimestamp}
                        modelName={message.modelName}
                        locale={locale}
                        labels={{
                          copied: t("chat.copied"),
                          copy: t("chat.copy"),
                          copyMessage: t("chat.copyMessage"),
                          share: t("chat.share"),
                          retry: t("chat.retry"),
                          sentAt: (time) => t("chat.sentAt", { time }),
                          completedAt: (time) =>
                            t("chat.completedAt", { time }),
                          today: t("chat.today"),
                          yesterday: t("chat.yesterday"),
                        }}
                        copied={copiedMessageId === message.id}
                        onCopy={() => {
                          void navigator.clipboard
                            .writeText(message.content)
                            .then(() => setCopiedMessageId(message.id));
                        }}
                        onShare={() => shareMessage(message.id)}
                        onRetry={
                          message.role === "assistant" && retryContent
                            ? () => void submitContent(retryContent, false)
                            : undefined
                        }
                        retryDisabled={
                          submitting || messageIndex !== latestAssistantIndex
                        }
                        />
                        {message.role === "assistant" &&
                        messageIndex === latestAssistantIndex &&
                        message.followUp ? (
                          <FollowUpSuggestionList
                            followUp={message.followUp}
                            sending={
                              sendingSuggestionSetId ===
                              message.followUp.suggestionSetId
                            }
                            labels={{
                              region: t("chat.followUp.region"),
                              send: (label) =>
                                t("chat.followUp.send", { label }),
                              insert: (label) =>
                                t("chat.followUp.insert", { label }),
                              sendTitle: t("chat.followUp.sendTitle"),
                              insertTitle: t("chat.followUp.insertTitle"),
                            }}
                            onSend={
                              onSendFollowUpSuggestion
                                ? (suggestion) => {
                                    setSendingSuggestionSetId(
                                      message.followUp!.suggestionSetId,
                                    );
                                    void Promise.resolve(
                                      onSendFollowUpSuggestion({
                                        sessionId: session.id,
                                        suggestionSetId:
                                          message.followUp!.suggestionSetId,
                                        suggestionId: suggestion.id,
                                        expectedSessionRevision:
                                          session.revision ?? 0,
                                        expectedSuggestionRevision:
                                          message.followUp!.revision,
                                        applicationLocale: locale,
                                      }),
                                    )
                                      .catch(() => toast.error("chat.sendFailed"))
                                      .finally(() =>
                                        setSendingSuggestionSetId(""),
                                      );
                                  }
                                : undefined
                            }
                            onInsert={(suggestion) => {
                              setPrompt((current) =>
                                current
                                  ? `${current}\n\n${suggestion.prompt}`
                                  : suggestion.prompt,
                              );
                              window.requestAnimationFrame(() => {
                                const textarea =
                                  document.querySelector<HTMLTextAreaElement>(
                                    'textarea[name="composer-prompt"]',
                                  );
                                textarea?.focus();
                                textarea?.setSelectionRange(
                                  textarea.value.length,
                                  textarea.value.length,
                                );
                              });
                            }}
                          />
                        ) : null}
                      </>
                    );
                  }}
                />
              )}
            </KnowledgeNoteCapture>
          )}
        </ConversationShareController>
        <div className="chat-session-composer">
          <Composer
            permissionRunIds={session.messages.flatMap(message => message.runId ? [message.runId] : [])}
            value={prompt}
            placeholder={t("chat.placeholder")}
            labels={{
              textarea: t("chat.continue"),
              model: t("conversation.model"),
              workspace: t("chat.currentSpace"),
              permission: t("chat.spacePermission"),
              submit: t("chat.send"),
              menu: t("conversation.addContent"),
              openMenu: t("conversation.openAddMenu"),
              closeMenu: t("conversation.closeAddMenu"),
            }}
            insertions={{
              mode: t("conversation.insertion.mode"),
              skill: t("conversation.insertion.skill"),
              connector: t("conversation.insertion.connector"),
            }}
            fileInputId={`session-attachment-${session.id}`}
            modelOptions={models.options}
            modelGroups={models.groups}
            modelProfileId={models.selectedId}
            effectiveModelProfileId={models.effectiveId}
            onModelProfileChange={models.select}
            onModelPickerOpen={() => void models.refresh()}
            disabled={submitting || Boolean(activeRunId)}
            cancelling={cancellingRunId === activeRunId}
            attachments={attachments}
            attachmentErrors={attachmentErrors}
            attachmentBusy={attachmentBusy}
            allowImageEgress={allowImageEgress}
            onImageEgressChange={setAllowImageEgress}
            onPickAttachments={() => {
              const api = window.realmflow?.conversationAttachments;
              if (!api || attachmentBusy) return;
              setAttachmentBusy(true);
              void api
                .pick({
                  requestId: crypto.randomUUID(),
                  draftId: draftId.current,
                })
                .then((result) => {
                  setAttachments((current) => [
                    ...current,
                    ...result.accepted.filter(
                      (candidate) =>
                        !current.some(({ id }) => id === candidate.id),
                    ),
                  ]);
                  setAttachmentErrors(result.rejected);
                })
                .finally(() => setAttachmentBusy(false));
            }}
            onRemoveAttachment={(attachmentId) => {
              const api = window.realmflow?.conversationAttachments;
              if (!api || attachmentBusy) return;
              setAttachmentBusy(true);
              void api
                .remove({
                  requestId: crypto.randomUUID(),
                  draftId: draftId.current,
                  attachmentId,
                })
                .then(() => {
                  setAttachments((current) =>
                    current.filter(({ id }) => id !== attachmentId),
                  );
                })
                .finally(() => setAttachmentBusy(false));
            }}
            showContext={false}
            compact
            onChange={setPrompt}
            onSubmit={() => void submitContent(prompt, true, true)}
            onCancel={
              activeRunId
                ? () => {
                    const api = window.realmflow?.agentRuntime;
                    if (!api || cancellingRunId) return;
                    setCancellingRunId(activeRunId);
                    void api
                      .cancel({ runId: activeRunId, sessionId: session.id })
                      .catch(() => {
                        setCancellingRunId("");
                        toast.error("chat.cancelFailed");
                      });
                  }
                : undefined
            }
          />
        </div>
      </div>
    </>
  );
}

export function artifactOpenFailureMessageKey(
  error: unknown,
): "chat.openArtifactFailed" | "chat.openArtifactMissing" {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  return /\bENOENT\b|no such file or directory|realpath|file not found/i.test(
    message,
  )
    ? "chat.openArtifactMissing"
    : "chat.openArtifactFailed";
}
