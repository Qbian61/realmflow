import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Navigate, useParams } from "react-router-dom";
import {
  Composer,
  type ComposerConnectorSelection,
  type ComposerSkillSelection,
  toConversationCapabilitySelection,
} from "../components/Composer";
import { Button, Field, IconButton, Toolbar } from "../components/ui";
import type { ChatSession } from "../domain/chat-session";
import type { WorkspaceSpace } from "../domain/workspace";
import { useModelProfiles } from "../app/hooks/use-model-profiles";
import { ConversationMessageFooter } from "../features/conversation/ConversationMessageFooter";
import { ConversationTurnList } from "../features/conversation/ConversationTurnList";
import { assembleConversationTurnViews } from "../features/conversation/conversation-turn-view";
import { useConversationTurnPages } from "../features/conversation/use-conversation-turn-pages";
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
import type {
  ConversationCapabilitySelection,
  ConversationTranscriptSearchResultDto,
} from "../../shared/business";
import type { ConversationTurnView } from "../../domain/conversation-turn";

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
    approvalProfileId?: import("../../domain/approval-profile").ApprovalProfileId,
    contextMode?: "auto" | "fresh" | "continuation",
    capabilities?: ConversationCapabilitySelection,
  ) => void | Promise<void>;
  onSendFollowUpSuggestion?: (command: {
    sessionId: string;
    suggestionSetId: string;
    suggestionId: string;
    expectedSessionRevision: number;
    expectedSuggestionRevision: number;
    applicationLocale?: "zh-CN" | "en" | "ja";
    approvalProfileId?: import("../../domain/approval-profile").ApprovalProfileId;
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
  const [selectedSkill, setSelectedSkill] =
    useState<ComposerSkillSelection>();
  const [selectedConnector, setSelectedConnector] =
    useState<ComposerConnectorSelection>();
  const [copiedMessageId, setCopiedMessageId] = useState("");
  const [sendingSuggestionSetId, setSendingSuggestionSetId] = useState("");
  const [cancellingRunId, setCancellingRunId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    ConversationTranscriptSearchResultDto[]
  >([]);
  const [searching, setSearching] = useState(false);
  const [searchWindow, setSearchWindow] = useState<
    ConversationTurnView[] | undefined
  >();
  const [targetTurnId, setTargetTurnId] = useState("");
  const session = sessions.find((item) => item.id === sessionId);
  const [selectedApproval, setSelectedApproval] = useState<{
    sessionId?: string; value: import("../../domain/approval-profile").ApprovalProfileId
  }>();
  const approvalProfileId = selectedApproval && selectedApproval.sessionId === sessionId
    ? selectedApproval.value : session?.approvalProfileId ?? "protected";
  const models = useModelProfiles(session?.modelProfileId);

  useEffect(() => {
    setSearchQuery("");
    setSearchResults([]);
    setSearchWindow(undefined);
    setTargetTurnId("");
    setSelectedSkill(undefined);
    setSelectedConnector(undefined);
  }, [sessionId]);

  const liveTurnViews = session
    ? assembleConversationTurnViews(session.turns, session.messages)
    : [];
  const turnPages = useConversationTurnPages({
    sessionId: session?.id ?? "",
    liveTurns: liveTurnViews,
  });

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
        : t("chat.knowledgeWorkspace", {
            name: space?.label ?? t("chat.local"),
          });
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
              allowImageEgress: hasImageAttachments(attachments),
            }
          : undefined;
      const capabilities = toConversationCapabilitySelection(
        selectedSkill,
        selectedConnector,
      );
      if (capabilities) {
        await onAppendMessage(
          session.id,
          content,
          models.selectedId || undefined,
          "auto",
          submission,
          approvalProfileId,
          "auto",
          capabilities,
        );
      } else {
        await onAppendMessage(
          session.id,
          content,
          models.selectedId || undefined,
          "auto",
          submission,
          approvalProfileId,
          "auto",
        );
      }
      if (clearPrompt) {
        setPrompt("");
        setAttachments([]);
        setAttachmentErrors([]);
        setSelectedSkill(undefined);
        setSelectedConnector(undefined);
        draftId.current = crypto.randomUUID();
      }
    } catch (error) {
      toast.error(
        conversationSendFailureMessageKey(error, Boolean(session.folderPath)),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const displayedTurnViews = searchWindow ?? turnPages.turns;
  const searchTranscript = async (): Promise<void> => {
    const query = searchQuery.trim();
    const api = window.realmflow?.business;
    if (!api || !query || searching) return;
    setSearching(true);
    try {
      setSearchResults(
        await api.searchConversationTranscript({
          sessionId: session.id,
          query,
          limit: 12,
        }),
      );
    } catch {
      setSearchResults([]);
      toast.error("chat.searchFailed");
    } finally {
      setSearching(false);
    }
  };
  const openSearchResult = async (
    result: ConversationTranscriptSearchResultDto,
  ): Promise<void> => {
    const api = window.realmflow?.business;
    if (!api) return;
    setSearching(true);
    try {
      const page = await api.listConversationTurns({
        sessionId: session.id,
        anchorTurnId: result.turnId,
        limit: 50,
      });
      setSearchWindow(page.turns);
      setTargetTurnId(result.turnId);
      setSearchResults([]);
    } catch {
      toast.error("chat.searchFailed");
    } finally {
      setSearching(false);
    }
  };
  const clearSearch = (): void => {
    setSearchQuery("");
    setSearchResults([]);
    setSearchWindow(undefined);
    setTargetTurnId("");
  };
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
  const openConversationAttachment = async (
    attachmentId: string,
  ): Promise<void> => {
    const api = window.realmflow?.conversationAttachments;
    if (!api || !workbench) return;
    try {
      const selection = await api.open(attachmentId);
      if (selection.files.length === 0) {
        throw new Error("Conversation attachment selection was empty");
      }
      workbench.openWorkspaceSelection(selection);
    } catch {
      toast.error("chat.openAttachmentFailed", {
        dedupeKey: `chat.openAttachmentFailed:${attachmentId}`,
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
              {contextLabel}
            </p>
          </div>
          <form
            className="chat-session-search"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              void searchTranscript();
            }}
          >
            <Field
              name="conversation-search"
              className="chat-session-search-field"
              label={<span className="sr-only">{t("chat.search")}</span>}
              endAdornment={
                <span className="chat-session-search-actions">
                  {searchQuery ? (
                    <IconButton
                      size="compact"
                      variant="ghost"
                      aria-label={t("chat.searchClear")}
                      title={t("chat.searchClear")}
                      onClick={clearSearch}
                    >
                      <X aria-hidden="true" size={14} />
                    </IconButton>
                  ) : null}
                  <IconButton
                    type="submit"
                    size="compact"
                    variant="ghost"
                    aria-label={t("chat.searchSubmit")}
                    title={t("chat.searchSubmit")}
                    disabled={searching || !searchQuery.trim()}
                  >
                    <Search aria-hidden="true" size={14} />
                  </IconButton>
                </span>
              }
            >
              <input
                type="search"
                value={searchQuery}
                aria-label={t("chat.search")}
                placeholder={t("chat.searchPlaceholder")}
                onChange={(event) => setSearchQuery(event.currentTarget.value)}
              />
            </Field>
            {searchResults.length > 0 ? (
              <div
                className="ui-menu ui-menu--compact chat-session-search-results"
                role="listbox"
                aria-label={t("chat.searchResults")}
              >
                {searchResults.map((result) => (
                  <Button
                    className="ui-menu-item"
                    role="option"
                    variant="ghost"
                    size="compact"
                    aria-selected="false"
                    key={result.messageId}
                    onClick={() => void openSearchResult(result)}
                  >
                    <span>{result.content}</span>
                  </Button>
                ))}
              </div>
            ) : null}
          </form>
        </Toolbar>
      </WorkspaceHeaderPortal>
      <div className="chat-session-page">
        <ConversationShareController
          title={session.title}
          turns={session.turns}
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
                <ConversationTurnList
                  turns={displayedTurnViews}
                  hasEarlierTurns={
                    searchWindow === undefined && turnPages.hasEarlierTurns
                  }
                  loadingEarlierTurns={turnPages.loadingEarlierTurns}
                  onLoadEarlier={
                    searchWindow === undefined
                      ? turnPages.loadEarlierTurns
                      : undefined
                  }
                  targetTurnId={targetTurnId}
                  selection={selection}
                  labels={{
                    messages: t("chat.messages"),
                    messageIndex: t("chat.messageIndex"),
                    jumpToTurn: (index, preview) =>
                      t("chat.jumpToMessage", { index, preview }),
                    openAttachment: (name) =>
                      t("chat.openAttachment", { name }),
                    thinking: t("chat.thinking"),
                    planningNext: t("chat.planningNext"),
                  }}
                  onOpenAttachment={openConversationAttachment}
                  onOpenGeneratedArtifact={openGeneratedArtifact}
                  renderFooter={(message, turn) => {
                    if (message.status === "pending") {
                      return null;
                    }
                    const retryContent =
                      message.role === "assistant"
                        ? turn.userMessage.content
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
                        aiGeneratedLabel={
                          message.role === "assistant" &&
                          turn.isLast
                            ? t("chat.aiGenerated")
                            : undefined
                        }
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
                          submitting || !turn.isLast
                        }
                        />
                        {message.role === "assistant" &&
                        turn.isLast &&
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
                                        approvalProfileId,
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
            approvalProfileId={approvalProfileId}
            onApprovalProfileChange={(value) => setSelectedApproval({ sessionId, value })}
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
            selectedSkill={selectedSkill}
            onSkillChange={setSelectedSkill}
            selectedConnector={selectedConnector}
            onConnectorChange={setSelectedConnector}
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

function conversationSendFailureMessageKey(
  error: unknown,
  hasFolderContext: boolean,
): "chat.sendFailed" | "chat.folderUnavailable" {
  if (!hasFolderContext) return "chat.sendFailed";
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  return /绑定的文件夹不可用|bound folder is unavailable|folder conversation context is unavailable|\bENOENT\b|no such file or directory|realpath|file not found/i.test(
    message,
  )
    ? "chat.folderUnavailable"
    : "chat.sendFailed";
}

function hasImageAttachments(
  attachments: readonly ConversationAttachmentDescriptor[],
): boolean {
  return attachments.some((attachment) => attachment.mediaKind === "image");
}
