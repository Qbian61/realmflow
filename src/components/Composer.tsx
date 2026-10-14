import {
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowUp,
  Blocks,
  Check,
  ChevronDown,
  ChevronRight,
  Folder,
  Link2,
  Paperclip,
  Plus,
  Square,
  WandSparkles,
  X,
} from "lucide-react";
import {
  ModelSelector,
  type ModelSelectorGroup,
} from "../features/conversation/ModelSelector";
import { ApprovalProfileSelector } from "../features/conversation/ApprovalProfileSelector";
import { useLocalization } from "../localization/LocalizationProvider";
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
  approvalProfileId?: import("../../domain/approval-profile").ApprovalProfileId;
  onApprovalProfileChange?: (value: import("../../domain/approval-profile").ApprovalProfileId) => void;
  value: string;
  permissionRunIds?: readonly string[];
  placeholder: string;
  labels: ComposerLabels;
  insertions: ComposerInsertions;
  fileInputId: string;
  workspaceOptions?: Array<{ value: string; label: string }>;
  modelOptions?: Array<{ value: string; label: string }>;
  modelGroups?: ModelSelectorGroup[];
  modelProfileId?: string;
  effectiveModelProfileId?: string;
  modelControl?: ReactNode;
  defaultWorkspace?: string;
  workspaceValue?: string;
  showContext?: boolean;
  compact?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
  cancelling?: boolean;
  attachments?: ConversationAttachmentDescriptor[];
  attachmentErrors?: Array<{ fileName: string; message: string }>;
  attachmentBusy?: boolean;
  allowImageEgress?: boolean;
  textareaRef?: RefObject<HTMLTextAreaElement>;
  onChange: (value: string) => void;
  onWorkspaceChange?: (value: string) => void;
  onModelProfileChange?: (value: string) => void;
  onModelPickerOpen?: () => void;
  onConfigureModels?: () => void;
  onPickAttachments?: () => void;
  onRemoveAttachment?: (attachmentId: string) => void;
  onImageEgressChange?: (allowed: boolean) => void;
  onSubmit: () => void;
  onCancel?: () => void;
};

export function Composer({
  approvalProfileId = "protected",
  onApprovalProfileChange,
  value,
  permissionRunIds = [],
  placeholder,
  labels,
  insertions,
  fileInputId,
  workspaceOptions,
  modelOptions = [{ value: "", label: "RealmFlow Agent" }],
  modelGroups,
  modelProfileId = "",
  effectiveModelProfileId,
  modelControl,
  defaultWorkspace = "none",
  workspaceValue,
  showContext = true,
  compact = false,
  autoFocus = false,
  disabled = false,
  cancelling = false,
  attachments = [],
  attachmentErrors = [],
  attachmentBusy = false,
  allowImageEgress = false,
  textareaRef,
  onChange,
  onWorkspaceChange,
  onModelProfileChange,
  onModelPickerOpen,
  onConfigureModels,
  onPickAttachments,
  onRemoveAttachment,
  onImageEgressChange,
  onSubmit,
  onCancel,
}: ComposerProps): JSX.Element {
  const { t } = useLocalization();
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [workspacePlacement, setWorkspacePlacement] = useState<"up" | "down">(
    "up",
  );
  const [uncontrolledWorkspaceValue, setUncontrolledWorkspaceValue] =
    useState(defaultWorkspace);
  const workspaceListboxId = useId();
  const attachmentMenuButtonRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const internalTextareaRef = useRef<HTMLTextAreaElement>(null);
  const resolvedTextareaRef = textareaRef ?? internalTextareaRef;
  const workspaceSelectorRef = useRef<HTMLDivElement>(null);
  const workspaceTriggerRef = useRef<HTMLButtonElement>(null);
  const workspaceListRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (workspaceValue !== undefined) return;
    setUncontrolledWorkspaceValue(defaultWorkspace);
  }, [defaultWorkspace, workspaceValue]);

  useEffect(() => {
    if (!workspaceMenuOpen) return;
    const close = (event: MouseEvent): void => {
      if (!workspaceSelectorRef.current?.contains(event.target as Node)) {
        setWorkspaceMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      setWorkspaceMenuOpen(false);
      workspaceTriggerRef.current?.focus();
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [workspaceMenuOpen]);

  useLayoutEffect(() => {
    if (!workspaceMenuOpen) return;
    workspaceListRef.current
      ?.querySelector<HTMLButtonElement>("[role='option']:not(:disabled)")
      ?.focus();
  }, [workspaceMenuOpen]);

  const selectedWorkspaceValue =
    workspaceValue ?? uncontrolledWorkspaceValue;
  const selectedWorkspaceOption =
    resolvedWorkspaceOptions.find(
      (option) => option.value === selectedWorkspaceValue,
    ) ??
    resolvedWorkspaceOptions[0] ?? { value: defaultWorkspace, label: "" };

  const toggleWorkspaceMenu = (): void => {
    if (disabled) return;
    setWorkspaceMenuOpen((open) => {
      const next = !open;
      if (next) {
        const bounds = workspaceSelectorRef.current?.getBoundingClientRect();
        if (bounds) {
          const spaceAbove = bounds.top - 8;
          const spaceBelow = window.innerHeight - bounds.bottom - 8;
          setWorkspacePlacement(
            spaceAbove >= 320 || spaceAbove >= spaceBelow ? "up" : "down",
          );
        }
      }
      return next;
    });
  };

  const chooseWorkspace = (nextValue: string): void => {
    if (workspaceValue === undefined) {
      setUncontrolledWorkspaceValue(nextValue);
    }
    onWorkspaceChange?.(nextValue);
    setWorkspaceMenuOpen(false);
  };

  const moveWorkspaceFocus = (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ): void => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const options = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        "[role='option']:not(:disabled)",
      ),
    );
    if (options.length === 0) return;
    const current = options.indexOf(document.activeElement as HTMLButtonElement);
    const target =
      event.key === "Home"
        ? options[0]
        : event.key === "End"
          ? options[options.length - 1]
          : event.key === "ArrowDown"
            ? options[(Math.max(current, -1) + 1) % options.length]
            : options[(current <= 0 ? options.length : current) - 1];
    event.preventDefault();
    target?.focus();
  };

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
    <div className="composer-surface">
    <div data-permission-run-ids={JSON.stringify(permissionRunIds)} />
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
                size="default"
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
                {attachmentMenuOpen ? <X size={18} /> : <Plus size={18} />}
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
            {showContext ? (
              <div
                className="model-selector composer-workspace-selector"
                ref={workspaceSelectorRef}
              >
                <button
                  ref={workspaceTriggerRef}
                  className="model-selector-trigger composer-workspace-selector-trigger"
                  type="button"
                  role="combobox"
                  aria-label={labels.workspace}
                  title={labels.workspace}
                  aria-expanded={workspaceMenuOpen}
                  aria-controls={workspaceListboxId}
                  disabled={disabled}
                  onClick={toggleWorkspaceMenu}
                >
                  <Folder size={18} />
                  <span>{selectedWorkspaceOption.label}</span>
                  <ChevronDown size={14} />
                </button>
                {workspaceMenuOpen ? (
                  <div
                    className="model-selector-popover approval-profile-selector-popover composer-workspace-selector-popover ui-menu"
                    data-placement={workspacePlacement}
                  >
                    <div
                      ref={workspaceListRef}
                      className="model-selector-list"
                      id={workspaceListboxId}
                      role="listbox"
                      aria-label={labels.workspace}
                      onKeyDown={moveWorkspaceFocus}
                    >
                      {resolvedWorkspaceOptions.map((option) => {
                        const selected =
                          option.value === selectedWorkspaceOption.value;
                        return (
                          <button
                            className="ui-menu-item"
                            type="button"
                            role="option"
                            aria-selected={selected}
                            value={option.value}
                            key={option.value}
                            onClick={() => chooseWorkspace(option.value)}
                          >
                            <span className="model-selector-option-content">
                              <Folder
                                className="model-selector-provider-logo"
                                size={14}
                              />
                              <span className="model-selector-option-label">
                                {option.label}
                              </span>
                            </span>
                            {selected ? <Check size={13} /> : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
            <ApprovalProfileSelector
              ariaLabel={labels.permission}
              value={approvalProfileId}
              labels={{
                cautious: t("composer.permission.ask"),
                protected: t("composer.permission.default"),
                trusted: t("composer.permission.allow"),
              }}
              descriptions={{
                cautious: t("composer.permission.askDescription"),
                protected: t("composer.permission.defaultDescription"),
                trusted: t("composer.permission.allowDescription"),
              }}
              disabled={disabled}
              onChange={(nextValue) => onApprovalProfileChange?.(nextValue)}
            />
          </div>
          <div className="composer-actions-right">
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
            {onCancel ? (
              <button
                className="send-action stop-action"
                type="button"
                aria-label={t(cancelling ? "composer.stopping" : "composer.stopGeneration")}
                title={t(cancelling ? "composer.stopping" : "composer.stopGeneration")}
                disabled={cancelling}
                onClick={onCancel}
              >
                <Square size={14} fill="currentColor" />
              </button>
            ) : (
              <button
                className="send-action"
                type="submit"
                aria-label={labels.submit}
                title={labels.submit}
                disabled={disabled || !value.trim()}
              >
                <ArrowUp size={17} />
              </button>
            )}
          </div>
        </div>
      </div>
    </form>
    </div>
  );
}
