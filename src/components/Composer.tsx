import {
  type FormEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  AudioLines,
  Blocks,
  BrainCircuit,
  ChevronDown,
  ChevronRight,
  Folder,
  Link2,
  Mic,
  Paperclip,
  Plus,
  ShieldCheck,
  WandSparkles,
  X,
} from "lucide-react";
import {
  ModelSelector,
  type ModelSelectorGroup,
} from "../features/conversation/ModelSelector";
import { useLocalization } from "../localization/LocalizationProvider";
import type { ReasoningPreference } from "../../domain/reasoning-router";
import type { ConversationAttachmentDescriptor } from "../../domain/conversation-input";
import {
  IconButton,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
} from "./ui";

type ComposerLabels = {
  textarea: string;
  model: string;
  workspace: string;
  permission: string;
  submit: string;
  menu: string;
  openMenu: string;
  closeMenu: string;
};

type ComposerInsertions = {
  mode: string;
  skill: string;
  connector: string;
};

type ComposerProps = {
  value: string;
  placeholder: string;
  labels: ComposerLabels;
  insertions: ComposerInsertions;
  fileInputId: string;
  workspaceOptions?: Array<{ value: string; label: string }>;
  modelOptions?: Array<{ value: string; label: string }>;
  modelGroups?: ModelSelectorGroup[];
  modelProfileId?: string;
  effectiveModelProfileId?: string;
  reasoningMode?: ReasoningPreference;
  reasoningSupported?: boolean;
  modelControl?: ReactNode;
  defaultWorkspace?: string;
  workspaceValue?: string;
  showContext?: boolean;
  compact?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
  attachments?: ConversationAttachmentDescriptor[];
  attachmentErrors?: Array<{ fileName: string; message: string }>;
  attachmentBusy?: boolean;
  allowImageEgress?: boolean;
  textareaRef?: RefObject<HTMLTextAreaElement>;
  onChange: (value: string) => void;
  onWorkspaceChange?: (value: string) => void;
  onModelProfileChange?: (value: string) => void;
  onModelPickerOpen?: () => void;
  onReasoningModeChange?: (value: ReasoningPreference) => void;
  onConfigureModels?: () => void;
  onPickAttachments?: () => void;
  onRemoveAttachment?: (attachmentId: string) => void;
  onImageEgressChange?: (allowed: boolean) => void;
  onSubmit: () => void;
};

export function Composer({
  value,
  placeholder,
  labels,
  insertions,
  fileInputId,
  workspaceOptions,
  modelOptions = [{ value: "", label: "RealmFlow Agent" }],
  modelGroups,
  modelProfileId = "",
  effectiveModelProfileId,
  reasoningMode = "auto",
  reasoningSupported,
  modelControl,
  defaultWorkspace = "none",
  workspaceValue,
  showContext = true,
  compact = false,
  autoFocus = false,
  disabled = false,
  attachments = [],
  attachmentErrors = [],
  attachmentBusy = false,
  allowImageEgress = false,
  textareaRef,
  onChange,
  onWorkspaceChange,
  onModelProfileChange,
  onModelPickerOpen,
  onReasoningModeChange,
  onConfigureModels,
  onPickAttachments,
  onRemoveAttachment,
  onImageEgressChange,
  onSubmit,
}: ComposerProps): JSX.Element {
  const { t } = useLocalization();
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const attachmentMenuButtonRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const internalTextareaRef = useRef<HTMLTextAreaElement>(null);
  const resolvedTextareaRef = textareaRef ?? internalTextareaRef;
  const resolvedWorkspaceOptions = workspaceOptions ?? [
    { value: "none", label: t("composer.defaultWorkspace") },
    { value: "realmflow", label: "realmflow" },
    { value: "xxx", label: t("composer.exampleWorkspace") },
  ];
  const resolvedModelGroups =
    modelGroups ??
    [
      {
        providerId: "models",
        providerName: "",
        models: modelOptions.filter((option) => option.value),
      },
    ];

  useEffect(() => {
    if (autoFocus) resolvedTextareaRef.current?.focus();
  }, [autoFocus, resolvedTextareaRef]);

  const fillPrompt = (nextValue: string): void => {
    onChange(nextValue);
    setAttachmentMenuOpen(false);
    resolvedTextareaRef.current?.focus();
  };

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (disabled || !value.trim()) return;
    onSubmit();
  };

  return (
    <form
      className={[
        "composer",
        showContext ? "" : "without-context",
        compact ? "compact" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onSubmit={submit}
    >
      <div className="composer-input">
        <textarea name="composer-prompt" autoComplete="off"
          ref={resolvedTextareaRef}
          value={value}
          aria-label={labels.textarea}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
        {attachments.length > 0 || attachmentErrors.length > 0 ? (
          <div className="composer-attachment-status">
            {attachments.length > 0 ? (
              <div
                className="composer-attachment-list"
                aria-label={t("conversation.attachments")}
              >
                {attachments.map((attachment) => (
                  <span className="composer-attachment-chip" key={attachment.id}>
                    <Paperclip size={13} aria-hidden="true" />
                    <span>{attachment.fileName}</span>
                    <button
                      type="button"
                      aria-label={t("conversation.removeAttachment", {
                        name: attachment.fileName,
                      })}
                      title={t("conversation.removeAttachmentAction")}
                      disabled={disabled || attachmentBusy}
                      onClick={() => onRemoveAttachment?.(attachment.id)}
                    >
                      <X size={13} />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            {attachmentErrors.map((error) => (
              <span
                className="composer-attachment-error"
                role="status"
                key={`${error.fileName}:${error.message}`}
              >
                {error.fileName}: {error.message}
              </span>
            ))}
            {attachments.some(
              (attachment) => attachment.mediaKind === "image",
            ) ? (
              <label className="composer-image-egress">
                <input name="composer-allow-image-egress" autoComplete="off"
                  type="checkbox"
                  checked={allowImageEgress}
                  disabled={disabled || attachmentBusy}
                  onChange={(event) =>
                    onImageEgressChange?.(event.target.checked)
                  }
                />
                <span>
                  {t("conversation.allowImageEgress", {
                    count: attachments.filter(
                      (attachment) => attachment.mediaKind === "image",
                    ).length,
                  })}
                </span>
              </label>
            ) : null}
          </div>
        ) : null}
        <div
          className="composer-actions composer-toolbar"
          role="toolbar"
          aria-label={labels.menu}
        >
          <div className="composer-actions-left">
            <div className="attachment-area">
              <Menu
                open={attachmentMenuOpen}
                onOpenChange={setAttachmentMenuOpen}
                trigger={attachmentMenuButtonRef.current}
              >
                <MenuContent
                  className="attachment-menu"
                  aria-label={labels.menu}
                >
                  <MenuItem
                    disabled={disabled}
                    onSelect={() => {
                      if (onPickAttachments) onPickAttachments();
                      else fileInputRef.current?.click();
                    }}
                  >
                    <Paperclip size={20} />
                    <span>{t("composer.addFile")}</span>
                    <ChevronRight size={17} />
                  </MenuItem>
                  <MenuItem
                    disabled={disabled}
                    onSelect={() => fillPrompt(insertions.mode)}
                  >
                    <WandSparkles size={20} />
                    <span>{t("composer.mode")}</span>
                    <ChevronRight size={17} />
                  </MenuItem>
                  <MenuSeparator />
                  <MenuItem
                    disabled={disabled}
                    onSelect={() => fillPrompt(insertions.skill)}
                  >
                    <Blocks size={20} />
                    <span>{t("composer.skill")}</span>
                    <ChevronRight size={17} />
                  </MenuItem>
                  <MenuItem
                    disabled={disabled}
                    onSelect={() => fillPrompt(insertions.connector)}
                  >
                    <Link2 size={20} />
                    <span>{t("composer.connector")}</span>
                    <ChevronRight size={17} />
                  </MenuItem>
                </MenuContent>
              </Menu>
              <IconButton
                ref={attachmentMenuButtonRef}
                className="icon-action"
                size="comfortable"
                variant="ghost"
                aria-label={
                  attachmentMenuOpen ? labels.closeMenu : labels.openMenu
                }
                title={
                  attachmentMenuOpen ? labels.closeMenu : labels.openMenu
                }
                aria-haspopup="menu"
                aria-expanded={attachmentMenuOpen}
                disabled={disabled}
                onClick={() => setAttachmentMenuOpen((open) => !open)}
              >
                {attachmentMenuOpen ? <X size={22} /> : <Plus size={22} />}
              </IconButton>
              <input name="composer-attachments" aria-label={t("composer.addFile")}
                ref={fileInputRef}
                id={fileInputId}
                type="file"
                hidden
                multiple
                disabled={disabled}
              />
            </div>
          </div>
          <div className="composer-actions-right">
            <label className="reasoning-control" title={t("conversation.reasoning")}>
              <BrainCircuit size={14} />
              <select name="composer-reasoning" autoComplete="off"
                aria-label={t("conversation.reasoning")}
                value={reasoningMode === "off" ? "low" : reasoningMode}
                disabled={disabled}
                onChange={(event) =>
                  onReasoningModeChange?.(
                    event.target.value as ReasoningPreference,
                  )
                }
              >
                <option value="auto">{t("conversation.reasoning.auto")}</option>
                <option value="low">{t("conversation.reasoning.quick")}</option>
                <option value="medium">
                  {t("conversation.reasoning.standard")}
                </option>
                <option value="high">{t("conversation.reasoning.deep")}</option>
              </select>
              <ChevronDown size={12} />
            </label>
            {modelControl ?? (
              <ModelSelector
                ariaLabel={labels.model}
                autoLabel={
                  modelOptions.find((option) => !option.value)?.label ??
                  t("model.autoSelect")
                }
                configureLabel={t("model.configure")}
                emptyLabel={t("model.noMatches")}
                searchPlaceholder={t("model.search")}
                groups={resolvedModelGroups}
                value={modelProfileId}
                effectiveValue={effectiveModelProfileId}
                disabled={disabled}
                onOpen={onModelPickerOpen}
                onChange={(value) => onModelProfileChange?.(value)}
                onConfigure={
                  onConfigureModels ??
                  (() => {
                    window.location.hash = "/settings?section=models";
                  })
                }
              />
            )}
            <button
              className="icon-action"
              type="button"
              aria-label={t("composer.voiceInput")}
              title={t("composer.voiceInput")}
              disabled={disabled}
            >
              <Mic size={20} />
            </button>
            <button
              className="send-action"
              type="submit"
              aria-label={labels.submit}
              title={labels.submit}
              disabled={disabled || !value.trim()}
            >
              <AudioLines size={20} />
            </button>
          </div>
        </div>
        {reasoningSupported === false && reasoningMode !== "off" ? (
          <span className="reasoning-degrade" role="status">
            {t("conversation.reasoning.unsupported")}
          </span>
        ) : null}
      </div>

      {showContext ? (
        <div className="composer-context composer-context-surface">
          <label className="select-control">
            <Folder size={18} />
            <select name="composer-select" autoComplete="off"
              aria-label={labels.workspace}
              {...(workspaceValue === undefined
                ? { defaultValue: defaultWorkspace }
                : { value: workspaceValue })}
              disabled={disabled}
              onChange={(event) => onWorkspaceChange?.(event.target.value)}
            >
              {resolvedWorkspaceOptions.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown size={14} />
          </label>
          <label className="select-control">
            <ShieldCheck size={18} />
            <select name="composer-permission" autoComplete="off"
              aria-label={labels.permission}
              defaultValue="default"
              disabled={disabled}
            >
              <option value="default">
                {t("composer.permission.default")}
              </option>
              <option value="ask">{t("composer.permission.ask")}</option>
              <option value="allow">{t("composer.permission.allow")}</option>
            </select>
            <ChevronDown size={14} />
          </label>
        </div>
      ) : null}
    </form>
  );
}
