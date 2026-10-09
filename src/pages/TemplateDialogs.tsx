import {
  type FormEvent,
  type ReactNode,
  useMemo,
  useRef,
  useState,
} from "react";
import { Plus, X } from "lucide-react";
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Field,
  IconButton,
} from "../components/ui";
import { useWorkspacePageActive } from "../features/navigation/WorkspaceRouteCache";
import { useLocalization } from "../localization/LocalizationProvider";

export type TemplateDefinition = {
  title: string;
  tag: string;
  description: string;
  prompt: string;
  uses: number;
};

type CreateTemplateDialogProps = {
  availableTags: string[];
  onClose: () => void;
  onCreate: (template: TemplateDefinition) => void;
};

type UseTemplateDialogProps = {
  template: TemplateDefinition;
  onClose: () => void;
  onUse: (prompt: string) => void;
};

function getPlaceholders(prompt: string): string[] {
  const names = [...prompt.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map(
    (match) => match[1],
  );
  return [...new Set(names)];
}

function DialogFrame({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}): JSX.Element {
  const { t } = useLocalization();
  const pageActive = useWorkspacePageActive();

  return (
    <Dialog
      open
      size="wide"
      locked={!pageActive}
      aria-labelledby="template-dialog-title"
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <div className="template-dialog">
        <DialogHeader>
          <h2 id="template-dialog-title">{title}</h2>
          <IconButton
            aria-label={t("templateDialog.close")}
            title={t("templateDialog.close")}
            variant="ghost"
            onClick={onClose}
          >
            <X size={22} />
          </IconButton>
        </DialogHeader>
        {children}
      </div>
    </Dialog>
  );
}

export function CreateTemplateDialog({
  availableTags,
  onClose,
  onCreate,
}: CreateTemplateDialogProps): JSX.Element {
  const { t } = useLocalization();
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [prompt, setPrompt] = useState("");
  const [placeholder, setPlaceholder] = useState("");
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const placeholders = useMemo(() => getPlaceholders(prompt), [prompt]);

  const addPlaceholder = (): void => {
    const normalizedName = placeholder.trim().replace(/\s+/g, "_");
    if (!normalizedName) return;
    setPrompt(
      (current) => `${current}${current ? " " : ""}{{${normalizedName}}}`,
    );
    setPlaceholder("");
    promptRef.current?.focus();
  };

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!name.trim() || !tag.trim() || !prompt.trim()) return;
    onCreate({
      title: name.trim(),
      tag: tag.trim(),
      description: t("templateDialog.customDescription", {
        count: placeholders.length,
      }),
      prompt: prompt.trim(),
      uses: 0,
    });
  };

  return (
    <DialogFrame title={t("template.create")} onClose={onClose}>
      <form className="template-dialog-form-shell" onSubmit={submit}>
        <DialogBody className="template-dialog-form">
        <div className="template-dialog-column">
          <div className="dialog-section-heading">
            <strong>{t("templateDialog.writeHeading")}</strong>
            <span>{t("templateDialog.writeHint")}</span>
          </div>
          <div className="template-meta-fields">
            <Field name="template-dialog-name" label={t("templateDialog.name")}>
              <input
                value={name}
                aria-label={t("templateDialog.name")}
                placeholder={t("templateDialog.namePlaceholder")}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field name="template-dialog-tag" label={t("templateDialog.tag")}>
              <input
                list="existing-template-tags"
                value={tag}
                aria-label={t("templateDialog.tag")}
                placeholder={t("templateDialog.tagPlaceholder")}
                onChange={(event) => setTag(event.target.value)}
              />
            </Field>
            <datalist id="existing-template-tags">
              {availableTags.map((existingTag) => (
                <option key={existingTag} value={existingTag} />
              ))}
            </datalist>
          </div>
          <Field name="template-dialog-prompt"
            className="template-prompt-field"
            label={t("templateDialog.prompt")}
          >
            <textarea
              ref={promptRef}
              value={prompt}
              aria-label={t("templateDialog.promptAria")}
              placeholder={t("templateDialog.promptPlaceholder")}
              onChange={(event) => setPrompt(event.target.value)}
            />
          </Field>
        </div>

        <div className="template-dialog-column parameter-column">
          <div className="dialog-section-heading">
            <strong>{t("templateDialog.placeholderHeading")}</strong>
            <span>{t("templateDialog.placeholderHint")}</span>
          </div>
          <div className="placeholder-adder">
            <Field name="template-dialog-placeholder-name" label={t("templateDialog.placeholderName")}>
              <input
                value={placeholder}
                placeholder={t("templateDialog.placeholderNamePlaceholder")}
                onChange={(event) => setPlaceholder(event.target.value)}
              />
            </Field>
            <IconButton
              aria-label={t("templateDialog.addPlaceholder")}
              title={t("templateDialog.addPlaceholder")}
              variant="ghost"
              onClick={addPlaceholder}
            >
              <Plus size={18} />
            </IconButton>
          </div>
          <div
            className="placeholder-list"
            aria-label={t("templateDialog.placeholderList")}
          >
            {placeholders.length > 0 ? (
              placeholders.map((name) => (
                <span key={name}>{`{{${name}}}`}</span>
              ))
            ) : (
              <div className="parameter-empty">
                <strong>{t("templateDialog.noPlaceholders")}</strong>
                <span>{t("templateDialog.noPlaceholdersHint")}</span>
              </div>
            )}
          </div>
        </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={!name.trim() || !tag.trim() || !prompt.trim()}
          >
            {t("templateDialog.save")}
          </Button>
        </DialogFooter>
      </form>
    </DialogFrame>
  );
}

export function UseTemplateDialog({
  template,
  onClose,
  onUse,
}: UseTemplateDialogProps): JSX.Element {
  const { t } = useLocalization();
  const placeholders = useMemo(
    () => getPlaceholders(template.prompt),
    [template.prompt],
  );
  const [values, setValues] = useState<Record<string, string>>({});
  const canUse = placeholders.every((name) => values[name]?.trim());

  const useTemplate = (): void => {
    if (!canUse) return;
    const resolvedPrompt = template.prompt.replace(
      /\{\{\s*([^{}]+?)\s*\}\}/g,
      (_, name: string) => values[name.trim()]?.trim() ?? "",
    );
    onUse(resolvedPrompt);
  };

  return (
    <DialogFrame title={template.title} onClose={onClose}>
      <DialogBody className="template-use-content">
        <div className="template-dialog-summary">
          <span>{template.tag}</span>
          <p>{template.description}</p>
        </div>
        <div className="template-use-body">
        <div className="template-dialog-column">
          <div className="dialog-section-heading">
            <strong>{t("templateDialog.previewHeading")}</strong>
            <span>{t("templateDialog.previewHint")}</span>
          </div>
          <div className="template-prompt-preview">
            {template.prompt
              .split(/(\{\{\s*[^{}]+?\s*\}\})/g)
              .map((part, index) =>
                part.startsWith("{{") ? (
                  <mark key={`${part}-${index}`}>{part}</mark>
                ) : (
                  <span key={`${part}-${index}`}>{part}</span>
                ),
              )}
          </div>
        </div>

        <div className="template-dialog-column parameter-column">
          <div className="dialog-section-heading">
            <strong>{t("templateDialog.taskHeading")}</strong>
            <span>{t("templateDialog.taskHint")}</span>
          </div>
          <div className="template-parameter-fields">
            {placeholders.map((name) => (
              <Field name={`template-placeholder-${name}`} label={name} key={name}>
                <textarea
                  value={values[name] ?? ""}
                  aria-label={t("templateDialog.placeholderAria", { name })}
                  placeholder={t("templateDialog.placeholderInput", { name })}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [name]: event.target.value,
                    }))
                  }
                />
              </Field>
            ))}
          </div>
        </div>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button type="button" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={!canUse}
          onClick={useTemplate}
        >
          {t("templateDialog.use")}
        </Button>
      </DialogFooter>
    </DialogFrame>
  );
}
