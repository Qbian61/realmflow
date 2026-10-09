import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import type { BusinessApi } from "../../../shared/business";
import { useLocalization } from "../../localization/LocalizationProvider";
import { useToast } from "../toast/ToastProvider";
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Field,
} from "../../components/ui";

type RequirementCreateDialogProps = {
  business?: BusinessApi;
  spaceLabel: string;
  onClose: () => void;
  onCreate: (
    title: string,
    templateVersionId: string,
  ) => void | Promise<void>;
};

type TemplateOption = {
  id: string;
  label: string;
};

export function RequirementCreateDialog({
  business,
  spaceLabel,
  onClose,
  onCreate,
}: RequirementCreateDialogProps): JSX.Element {
  const { t } = useLocalization();
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [templateVersionId, setTemplateVersionId] = useState("");
  const [allOptions, setAllOptions] = useState<TemplateOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let disposed = false;
    setLoading(true);
    setError(null);

    if (!business) {
      setAllOptions([]);
      setLoading(false);
      return () => {
        disposed = true;
      };
    }

    void Promise.all([
      business.listWorkflowTemplates(),
      business.listWorkflowTemplateLibrary(),
    ])
      .then(([versions, library]) => {
        if (disposed) return;
        const names = new Map(library.map((template) => [template.id, template.name]));
        setAllOptions(
          versions
            .filter((version) => version.status === "published")
            .map((version) => ({
              id: version.id,
              label: `${names.get(version.templateId) ?? t("requirement.unknownTemplate")} · v${version.version}`,
            }))
            .sort((left, right) => left.label.localeCompare(right.label)),
        );
      })
      .catch(() => {
        if (!disposed) {
          setAllOptions([]);
          setError(t("requirement.templateLoadFailed"));
        }
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });

    return () => {
      disposed = true;
    };
  }, [business, t]);

  const canSubmit = useMemo(
    () => Boolean(title.trim() && templateVersionId && !loading && !submitting),
    [loading, submitting, templateVersionId, title],
  );

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await onCreate(title.trim(), templateVersionId);
      onClose();
    } catch {
      toast.error("toast.requirement.createFailed");
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open
      size="compact"
      locked={submitting}
      aria-labelledby="requirement-create-dialog-title"
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <form
        className="requirement-create-dialog"
        onSubmit={(event) => void submit(event)}
      >
        <DialogHeader>
          <h2 id="requirement-create-dialog-title">
            {t("requirement.createDialog")}
          </h2>
        </DialogHeader>
        <DialogBody className="requirement-create-dialog__body">
          <Field name="requirement-name" label={t("requirement.name")}>
            <input
              data-autofocus
              value={title}
              maxLength={64}
              placeholder={t("requirement.namePlaceholder", {
                name: spaceLabel,
              })}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>
          <Field name="requirement-template"
            label={t("requirement.template")}
            disabled={loading || allOptions.length === 0}
          >
            <select
              value={templateVersionId}
              onChange={(event) => setTemplateVersionId(event.target.value)}
            >
              <option value="">
                {loading
                  ? t("requirement.templateLoading")
                  : allOptions.length === 0
                    ? t("requirement.templateEmpty")
                    : t("requirement.templatePlaceholder")}
              </option>
              {allOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          {error ? (
            <p className="name-dialog-error" role="alert">
              {error}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button type="button" disabled={submitting} onClick={onClose}>
            {t("dialog.cancel")}
          </Button>
          <Button
            variant="primary"
            type="submit"
            aria-label={t("requirement.createConfirm")}
            disabled={!canSubmit}
            loading={submitting}
          >
            {t("dialog.create")}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
