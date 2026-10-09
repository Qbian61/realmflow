import { useEffect, useState, type ReactNode } from "react";
import type {
  ConversationDto,
  NodeQuestionDto,
} from "../../../shared/business";
import { Composer } from "../../components/Composer";
import { useLocalization } from "../../localization/LocalizationProvider";
import { ConversationMessageFooter } from "./ConversationMessageFooter";
import { ConversationMessageList } from "./ConversationMessageList";
import { ConversationShareController } from "./ConversationShareController";
import { KnowledgeNoteCapture } from "./KnowledgeNoteCapture";
import { useToast } from "../toast/ToastProvider";

type Props = {
  requirementId: string;
  nodeId: string;
  nodeName: string;
  nodeRunId: string;
  conversation?: ConversationDto;
  interactive: boolean;
  questions: NodeQuestionDto[];
  modelControl?: ReactNode;
  onReload: (nodeId: string) => Promise<void>;
  onResponseActiveChange?: (active: boolean) => void;
};

export function RequirementNodeConversationPanel({
  requirementId,
  nodeId,
  nodeName,
  nodeRunId,
  conversation,
  interactive,
  questions,
  modelControl,
  onReload,
  onResponseActiveChange,
}: Props): JSX.Element {
  const { locale, t } = useLocalization();
  const toast = useToast();
  const [prompt, setPrompt] = useState("");
  const [questionId, setQuestionId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState("");
  const [committedConversation, setCommittedConversation] =
    useState(conversation);
  const displayedConversation = committedConversation ?? conversation;
  const openQuestions = questions.filter(
    (question) => question.status === "open",
  );
  const latestAssistantIndex =
    displayedConversation?.messages
      .map((message) => message.role === "assistant")
      .lastIndexOf(true) ?? -1;
  const responseActive =
    displayedConversation?.messages.some(
      (message) =>
        message.role === "assistant" && message.status === "pending",
    ) ?? false;

  useEffect(() => {
    setCommittedConversation((current) => {
      if (!conversation) return current;
      if (
        current?.id === conversation.id &&
        current.revision > conversation.revision
      ) {
        return current;
      }
      return conversation;
    });
  }, [conversation]);

  useEffect(() => {
    const business = window.realmflow?.business;
    if (!business?.onConversationEvent) return;
    return business.onConversationEvent(({ conversation: snapshot }) => {
      if (snapshot.nodeRunId !== nodeRunId) return;
      setCommittedConversation((current) =>
        !current || snapshot.revision >= current.revision ? snapshot : current,
      );
    });
  }, [nodeRunId]);

  useEffect(() => {
    onResponseActiveChange?.(responseActive);
  }, [onResponseActiveChange, responseActive]);

  useEffect(
    () => () => onResponseActiveChange?.(false),
    [onResponseActiveChange],
  );

  const sendContent = async (
    rawContent: string,
    clearPrompt: boolean,
    references?: {
      questionId: string;
      expectedQuestionRevision: number;
    },
  ): Promise<void> => {
    const content = rawContent.trim();
    const business = window.realmflow?.business;
    if (!content || !business || submitting) return;
    setSubmitting(true);
    try {
      if (displayedConversation) {
        await business.appendConversationMessage({
          sessionId: displayedConversation.id,
          messageId: globalThis.crypto.randomUUID(),
          content,
          expectedRevision: displayedConversation.revision,
          applicationLocale: locale,
          ...(references ? { references } : {}),
        });
      } else {
        await business.createConversation({
          id: globalThis.crypto.randomUUID(),
          kind: "requirement_node",
          knowledgeScope: { kind: "node_configuration" },
          requirementId,
          nodeRunId,
          title: nodeName,
          prompt: content,
          applicationLocale: locale,
          ...(references ? { references } : {}),
        });
      }
      if (clearPrompt) {
        setPrompt("");
        setQuestionId("");
      }
      await onReload(nodeId);
    } catch {
      toast.error("nodeConversation.sendFailed");
    } finally {
      setSubmitting(false);
    }
  };
  const submit = (): Promise<void> => {
    const question = openQuestions.find(({ id }) => id === questionId);
    return sendContent(
      prompt,
      true,
      question
        ? {
            questionId: question.id,
            expectedQuestionRevision: question.revision,
          }
        : undefined,
    );
  };

  return (
    <section
      className="requirement-node-conversation"
      aria-label={t("nodeConversation.title")}
    >
      {displayedConversation?.messages.length ? (
        <ConversationShareController
          title={displayedConversation.title}
          messages={displayedConversation.messages}
        >
          {(shareMessage) => (
            <KnowledgeNoteCapture
              business={window.realmflow?.business}
              workspaceId={displayedConversation.workspaceId}
              sessionId={displayedConversation.id}
              messages={displayedConversation.messages}
            >
              {(selection) => (
                <ConversationMessageList
                  className="requirement-node-messages"
                  messages={displayedConversation.messages}
                  selection={selection}
                  labels={{
                    messages: t("nodeConversation.messages"),
                    messageIndex: t("chat.messageIndex"),
                    jumpToMessage: (index, preview) =>
                      t("chat.jumpToMessage", { index, preview }),
                    tool: t("chat.tool"),
                    generating: t("nodeConversation.generating"),
                  }}
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
                        ? displayedConversation.messages
                            .slice(0, messageIndex)
                            .reverse()
                            .find((item) => item.role === "user")?.content
                        : undefined;
                    return (
                      <ConversationMessageFooter
                        role={message.role}
                        content={message.content}
                        timestamp={message.createdAt}
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
                            ? () => void sendContent(retryContent, false)
                            : undefined
                        }
                        retryDisabled={
                          !interactive ||
                          submitting ||
                          messageIndex !== latestAssistantIndex
                        }
                      />
                    );
                  }}
                />
              )}
            </KnowledgeNoteCapture>
          )}
        </ConversationShareController>
      ) : null}
      {interactive ? (
        <div className="requirement-node-conversation-compose">
          {openQuestions.length > 0 ? (
            <label className="requirement-node-question-link">
              <span>{t("nodeConversation.linkQuestion")}</span>
              <select name="node-conversation-link-question" autoComplete="off"
                aria-label={t("nodeConversation.linkQuestion")}
                value={questionId}
                disabled={submitting}
                onChange={(event) => setQuestionId(event.target.value)}
              >
                <option value="">{t("nodeConversation.noQuestion")}</option>
                {openQuestions.map((question) => (
                  <option key={question.id} value={question.id}>
                    {question.prompt}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <Composer
            value={prompt}
            placeholder={t("nodeConversation.placeholder")}
            labels={{
              textarea: t("nodeConversation.content"),
              model: t("nodeConversation.model"),
              workspace: t("nodeConversation.currentRequirement"),
              permission: t("nodeConversation.permission"),
              submit: t("nodeConversation.send"),
              menu: t("conversation.addContent"),
              openMenu: t("conversation.openAddMenu"),
              closeMenu: t("conversation.closeAddMenu"),
            }}
            insertions={{
              mode: t("conversation.insertion.mode"),
              skill: t("conversation.insertion.skill"),
              connector: t("conversation.insertion.connector"),
            }}
            fileInputId={`node-conversation-${nodeRunId}`}
            modelControl={modelControl}
            showContext={false}
            compact
            disabled={submitting}
            onChange={setPrompt}
            onSubmit={() => void submit()}
          />
        </div>
      ) : (
        <p className="requirement-node-conversation-readonly">
          {t("nodeConversation.readonly")}
        </p>
      )}
    </section>
  );
}
