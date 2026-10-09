import { useRef, useState } from "react";
import { Plus, Search, Settings2 } from "lucide-react";
import { Composer } from "../components/Composer";
import {
  CreateTemplateDialog,
  type TemplateDefinition,
  UseTemplateDialog,
} from "./TemplateDialogs";
import type { WorkspaceSpace } from "../domain/workspace";
import { useModelProfiles } from "../app/hooks/use-model-profiles";
import { useToast } from "../features/toast/ToastProvider";
import { useLocalization } from "../localization/LocalizationProvider";
import type { Translator } from "../localization/translate";
import type { ReasoningPreference } from "../../domain/reasoning-router";
import type { ConversationAttachmentDescriptor } from "../../domain/conversation-input";
import type { ConversationAttachmentSubmission } from "../../shared/conversation-attachments";

function createBuiltinTemplates(t: Translator): TemplateDefinition[] {
  return [
    {
      title: t("template.requirement.title"),
      tag: t("template.tag.requirementAnalysis"),
      description: t("template.requirement.description"),
      prompt: t("template.requirement.prompt"),
      uses: 648,
    },
    {
      title: t("template.design.title"),
      tag: t("template.tag.technicalDesign"),
      description: t("template.design.description"),
      prompt: t("template.design.prompt"),
      uses: 326,
    },
    {
      title: t("template.test.title"),
      tag: t("template.tag.testCases"),
      description: t("template.test.description"),
      prompt: t("template.test.prompt"),
      uses: 154,
    },
    {
      title: t("template.review.title"),
      tag: t("template.tag.codeReview"),
      description: t("template.review.description"),
      prompt: t("template.review.prompt"),
      uses: 860,
    },
    {
      title: t("template.report.title"),
      tag: t("template.tag.writing"),
      description: t("template.report.description"),
      prompt: t("template.report.prompt"),
      uses: 410,
    },
    {
      title: t("template.database.title"),
      tag: t("template.tag.databaseDesign"),
      description: t("template.database.description"),
      prompt: t("template.database.prompt"),
      uses: 274,
    },
    {
      title: t("template.api.title"),
      tag: t("template.tag.writing"),
      description: t("template.api.description"),
      prompt: t("template.api.prompt"),
      uses: 720,
    },
    {
      title: t("template.frontend.title"),
      tag: t("template.tag.appDevelopment"),
      description: t("template.frontend.description"),
      prompt: t("template.frontend.prompt"),
      uses: 531,
    },
    {
      title: t("template.debug.title"),
      tag: t("template.tag.troubleshooting"),
      description: t("template.debug.description"),
      prompt: t("template.debug.prompt"),
      uses: 388,
    },
    {
      title: t("template.release.title"),
      tag: t("template.tag.release"),
      description: t("template.release.description"),
      prompt: t("template.release.prompt"),
      uses: 221,
    },
    {
      title: t("template.performance.title"),
      tag: t("template.tag.performance"),
      description: t("template.performance.description"),
      prompt: t("template.performance.prompt"),
      uses: 186,
    },
    {
      title: t("template.migration.title"),
      tag: t("template.tag.databaseDesign"),
      description: t("template.migration.description"),
      prompt: t("template.migration.prompt"),
      uses: 92,
    },
  ];
}

type NewChatPageProps = {
  spaces?: WorkspaceSpace[];
  onCreateSession?: (
    spacePath: string,
    prompt: string,
    modelProfileId?: string,
    reasoningMode?: ReasoningPreference,
    attachments?: ConversationAttachmentSubmission,
  ) => void | Promise<void>;
};

export function NewChatPage({
  spaces = [],
  onCreateSession,
}: NewChatPageProps = {}): JSX.Element {
  const { t } = useLocalization();
  const toast = useToast();
  const [prompt, setPrompt] = useState("");
  const [submittedPrompt, setSubmittedPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [selectedWorkspace, setSelectedWorkspace] = useState("none");
  const [reasoningMode, setReasoningMode] =
    useState<ReasoningPreference>("auto");
  const draftId = useRef(crypto.randomUUID());
  const [attachments, setAttachments] = useState<
    ConversationAttachmentDescriptor[]
  >([]);
  const [attachmentErrors, setAttachmentErrors] = useState<
    Array<{ fileName: string; message: string }>
  >([]);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [allowImageEgress, setAllowImageEgress] = useState(false);
  const models = useModelProfiles();
  const [selectedFolder, setSelectedFolder] = useState<{
    value: string;
    label: string;
  } | null>(null);
  const [activeTemplateTag, setActiveTemplateTag] = useState("all");
  const [templateSearch, setTemplateSearch] = useState("");
  const [customTemplates, setCustomTemplates] = useState<TemplateDefinition[]>(
    [],
  );
  const [createTemplateOpen, setCreateTemplateOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] =
    useState<TemplateDefinition | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const templates = createBuiltinTemplates(t);
  const allTemplates = [...templates, ...customTemplates];
  const templatesByUsage = [...allTemplates].sort(
    (left, right) => right.uses - left.uses,
  );
  const templateTags = [...new Set(allTemplates.map(({ tag }) => tag))];

  const fillPrompt = (value: string): void => {
    setPrompt(value);
    textareaRef.current?.focus();
  };

  const submitPrompt = async (): Promise<void> => {
    const nextPrompt = prompt.trim();
    if (!nextPrompt || submitting) return;
    if (!models.loading && models.groups.length === 0) {
      window.location.hash = "/settings?section=models";
      return;
    }
    if (onCreateSession) {
      setSubmitting(true);
      try {
        const submission =
          attachments.length > 0
            ? {
                draftId: draftId.current,
                attachmentIds: attachments.map(({ id }) => id),
                allowImageEgress,
              }
            : undefined;
        if (submission) {
          await onCreateSession(
            selectedWorkspace,
            nextPrompt,
            models.selectedId || undefined,
            reasoningMode,
            submission,
          );
        } else {
          await onCreateSession(
            selectedWorkspace,
            nextPrompt,
            models.selectedId || undefined,
            reasoningMode,
          );
        }
        setPrompt("");
        setAttachments([]);
        setAttachmentErrors([]);
        setAllowImageEgress(false);
        draftId.current = crypto.randomUUID();
      } catch {
        toast.error("newChat.createFailed");
      } finally {
        setSubmitting(false);
      }
      return;
    }
    setSubmittedPrompt(nextPrompt);
  };

  return (
    <div className="new-chat-page">
      <h1 className="sr-only">{t("navigation.newChat")}</h1>
      <section className="chat-launcher" aria-label={t("newChat.region")}>
        <Composer
          value={prompt}
          textareaRef={textareaRef}
          placeholder={t("newChat.placeholder")}
          labels={{
            textarea: t("newChat.content"),
            model: t("conversation.model"),
            workspace: t("newChat.workspace"),
            permission: t("newChat.permission"),
            submit: t("newChat.send"),
            menu: t("conversation.addContent"),
            openMenu: t("conversation.openAddMenu"),
            closeMenu: t("conversation.closeAddMenu"),
          }}
          insertions={{
            mode: t("conversation.insertion.mode"),
            skill: t("conversation.insertion.skill"),
            connector: t("conversation.insertion.connector"),
          }}
          fileInputId="chat-attachment"
          modelOptions={models.options}
          modelGroups={models.groups}
          modelProfileId={models.selectedId}
          effectiveModelProfileId={models.effectiveId}
          reasoningMode={reasoningMode}
          reasoningSupported={models.reasoningSupported}
          onModelProfileChange={models.select}
          onModelPickerOpen={() => void models.refresh()}
          onReasoningModeChange={setReasoningMode}
          disabled={submitting}
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
          workspaceOptions={[
            { value: "none", label: t("newChat.noWorkspace") },
            { value: "all-workspaces", label: t("newChat.allWorkspaces") },
            { value: "local-folder", label: t("newChat.chooseFolder") },
            ...(selectedFolder ? [selectedFolder] : []),
            ...spaces.map((space) => ({
              value: space.path,
              label: space.label,
            })),
          ]}
          workspaceValue={selectedWorkspace}
          onWorkspaceChange={(value) => {
            if (value !== "local-folder") {
              setSelectedWorkspace(value);
              return;
            }
            void window.realmflow?.workspace.chooseFolder().then((binding) => {
              if (!binding) {
                setSelectedWorkspace("none");
                return;
              }
              const option = {
                value: `folder:${binding.requirementId}`,
                label: binding.rootName,
              };
              setSelectedFolder(option);
              setSelectedWorkspace(option.value);
            });
          }}
          onChange={setPrompt}
          onSubmit={() => void submitPrompt()}
        />

        {!models.loading && models.groups.length === 0 ? (
          <div className="new-chat-model-guide" role="status">
            <span>{t("model.setupRequired")}</span>
            <button
              type="button"
              onClick={() => {
                window.location.hash = "/settings?section=models";
              }}
            >
              <Settings2 size={14} />
              {t("model.configure")}
            </button>
          </div>
        ) : null}
        <p className="sr-only" aria-live="polite">
          {submittedPrompt
            ? t("newChat.prepared", { prompt: submittedPrompt })
            : ""}
        </p>
      </section>

      <section className="template-market" aria-label={t("template.market")}>
        <div
          className="template-filters"
          role="toolbar"
          aria-label={t("template.filterToolbar")}
        >
          <div className="template-filter-options">
            {["all", ...templateTags].map((tag) => (
              <button
                className={activeTemplateTag === tag ? "active" : ""}
                key={tag}
                type="button"
                aria-pressed={activeTemplateTag === tag}
                onClick={() => setActiveTemplateTag(tag)}
              >
                {tag === "all" ? t("template.all") : tag}
              </button>
            ))}
          </div>
          <label className="template-filter-search">
            <Search size={17} />
            <input name="template-search" autoComplete="off"
              type="search"
              value={templateSearch}
              aria-label={t("template.search")}
              placeholder={t("template.search")}
              onChange={(event) => setTemplateSearch(event.target.value)}
            />
          </label>
        </div>

        <div className="template-grid">
          <article className="create-template">
            <div>
              <h2>{t("template.create")}</h2>
              <p>{t("template.createDescription")}</p>
            </div>
            <div className="create-template-action-area">
              <button
                className="create-template-trigger"
                type="button"
                aria-label={t("template.new")}
                title={t("template.new")}
                onClick={() => setCreateTemplateOpen(true)}
              >
                <Plus size={40} strokeWidth={1.5} />
              </button>
            </div>
          </article>

          {templatesByUsage
            .filter(
              ({ tag }) =>
                activeTemplateTag === "all" || tag === activeTemplateTag,
            )
            .filter(({ title, description, tag }) =>
              `${title} ${description} ${tag}`
                .toLowerCase()
                .includes(templateSearch.trim().toLowerCase()),
            )
            .map((template) => (
              <article
                className="template-card"
                key={template.title}
                role="button"
                tabIndex={0}
                aria-label={t("template.open", { title: template.title })}
                onClick={() => setSelectedTemplate(template)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedTemplate(template);
                  }
                }}
              >
                <div>
                  <h2>{template.title}</h2>
                  <p>{template.description}</p>
                </div>
                <footer>
                  <span className="template-footer-tag">{template.tag}</span>
                  <span>{t("template.uses", { count: template.uses })}</span>
                </footer>
              </article>
            ))}
        </div>
      </section>

      {createTemplateOpen && (
        <CreateTemplateDialog
          availableTags={templateTags}
          onClose={() => setCreateTemplateOpen(false)}
          onCreate={(template) => {
            setCustomTemplates((current) => [...current, template]);
            setActiveTemplateTag("all");
            setTemplateSearch("");
            setCreateTemplateOpen(false);
          }}
        />
      )}

      {selectedTemplate && (
        <UseTemplateDialog
          template={selectedTemplate}
          onClose={() => setSelectedTemplate(null)}
          onUse={(resolvedPrompt) => {
            fillPrompt(resolvedPrompt);
            setSelectedTemplate(null);
          }}
        />
      )}
    </div>
  );
}
