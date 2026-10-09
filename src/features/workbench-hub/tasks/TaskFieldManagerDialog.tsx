import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import type {
  WorkbenchTaskField,
  WorkbenchTaskFieldConfig,
  WorkbenchTaskFieldType,
} from "../../../../shared/workbench-tasks";
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Field,
  IconButton,
} from "../../../components/ui";
import { useLocalization } from "../../../localization/LocalizationProvider";

export type TaskFieldDraft = {
  name: string;
  fieldType: WorkbenchTaskFieldType;
  options: string;
};

type TaskFieldManagerDialogProps = {
  fields: WorkbenchTaskField[];
  saving: boolean;
  onClose: () => void;
  onCreate: (draft: TaskFieldDraft) => Promise<void>;
  onUpdate: (
    field: WorkbenchTaskField,
    draft: TaskFieldDraft,
  ) => Promise<void>;
  onMove: (
    field: WorkbenchTaskField,
    direction: "up" | "down",
  ) => Promise<void>;
  onDelete: (field: WorkbenchTaskField) => void;
};

const EMPTY_DRAFT: TaskFieldDraft = {
  name: "",
  fieldType: "text",
  options: "",
};

export function TaskFieldManagerDialog({
  fields,
  saving,
  onClose,
  onCreate,
  onUpdate,
  onMove,
  onDelete,
}: TaskFieldManagerDialogProps): JSX.Element {
  const { t } = useLocalization();
  const [selectedId, setSelectedId] = useState<string | "new">(
    fields[0]?.id ?? "new",
  );
  const selected = fields.find(({ id }) => id === selectedId);
  const [draft, setDraft] = useState<TaskFieldDraft>(
    selected ? toDraft(selected) : EMPTY_DRAFT,
  );

  useEffect(() => {
    const current = fields.find(({ id }) => id === selectedId);
    if (current) setDraft(toDraft(current));
    if (!current && selectedId !== "new") {
      setSelectedId(fields[0]?.id ?? "new");
    }
  }, [fields, selectedId]);

  const choose = (field?: WorkbenchTaskField): void => {
    setSelectedId(field?.id ?? "new");
    setDraft(field ? toDraft(field) : EMPTY_DRAFT);
  };
  const usesOptions =
    draft.fieldType === "single_select" ||
    draft.fieldType === "multi_select";

  return (
    <Dialog
      open
      size="wide"
      className="workbench-task-field-manager"
      aria-label={t("workbenchTasks.manageFields")}
      locked={saving}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogHeader>
        <strong>{t("workbenchTasks.manageFields")}</strong>
        <IconButton
          aria-label={t("workbenchHub.close")}
          title={t("workbenchHub.close")}
          variant="ghost"
          size="compact"
          onClick={onClose}
        >
          <X size={16} />
        </IconButton>
      </DialogHeader>
      <DialogBody className="workbench-task-field-manager-body">
          <nav aria-label={t("workbenchTasks.fields")}>
            {fields.map((field, index) => (
              <div key={field.id} data-active={field.id === selectedId}>
                <button type="button" onClick={() => choose(field)}>
                  {field.name}
                </button>
                <button
                  type="button"
                  aria-label={t("workbenchTasks.moveFieldUp", { name: field.name })}
                  title={t("tooltip.moveUp")}
                  disabled={index === 0 || saving}
                  onClick={() => void onMove(field, "up")}
                >
                  <ArrowUp size={13} />
                </button>
                <button
                  type="button"
                  aria-label={t("workbenchTasks.moveFieldDown", { name: field.name })}
                  title={t("tooltip.moveDown")}
                  disabled={index === fields.length - 1 || saving}
                  onClick={() => void onMove(field, "down")}
                >
                  <ArrowDown size={13} />
                </button>
                <button
                  type="button"
                  className="danger"
                  aria-label={t("workbenchTasks.deleteField", { name: field.name })}
                  title={t("tooltip.delete")}
                  disabled={saving}
                  onClick={() => onDelete(field)}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            <button type="button" className="add" onClick={() => choose()}>
              <Plus size={14} />
              {t("workbenchTasks.addField")}
            </button>
          </nav>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void (selected ? onUpdate(selected, draft) : onCreate(draft));
            }}
          >
            <Field name="workbench-tasks-name" label={t("workbenchTasks.name")}>
              <input
                data-autofocus
                value={draft.name}
                onChange={(event) =>
                  setDraft({ ...draft, name: event.target.value })
                }
              />
            </Field>
            <Field name="workbench-tasks-field-type" label={t("workbenchTasks.fieldType")}>
              <select
                value={draft.fieldType}
                disabled={Boolean(selected)}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    fieldType: event.target.value as WorkbenchTaskFieldType,
                  })
                }
              >
                {FIELD_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`workbenchTasks.fieldType.${type}` as never)}
                  </option>
                ))}
              </select>
            </Field>
            {usesOptions ? (
              <Field name="workbench-tasks-options" label={t("workbenchTasks.options")}>
                <input
                  value={draft.options}
                  onChange={(event) =>
                    setDraft({ ...draft, options: event.target.value })
                  }
                />
              </Field>
            ) : null}
            <DialogFooter>
              <Button onClick={onClose}>
                {t("workbenchTasks.cancel")}
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={saving}
                disabled={saving || !draft.name.trim()}
              >
                {saving
                  ? t("workbenchTasks.saving")
                  : t(selected ? "workbenchTasks.save" : "workbenchTasks.create")}
              </Button>
            </DialogFooter>
          </form>
      </DialogBody>
    </Dialog>
  );
}

export function fieldConfigFromDraft(
  draft: TaskFieldDraft,
  previous?: WorkbenchTaskFieldConfig,
): WorkbenchTaskFieldConfig {
  if (
    draft.fieldType !== "single_select" &&
    draft.fieldType !== "multi_select"
  ) {
    return {};
  }
  const previousByLabel = new Map(
    previous?.options?.map((option) => [option.label, option]) ?? [],
  );
  return {
    options: draft.options
      .split(",")
      .map((label) => label.trim())
      .filter(Boolean)
      .map(
        (label, index) =>
          previousByLabel.get(label) ?? {
            id: `option-${Date.now()}-${index}`,
            label,
            color: "gray" as const,
          },
      ),
  };
}

const FIELD_TYPES: WorkbenchTaskFieldType[] = [
  "text",
  "date",
  "single_select",
  "multi_select",
  "url",
  "attachment",
];

function toDraft(field: WorkbenchTaskField): TaskFieldDraft {
  return {
    name: field.name,
    fieldType: field.fieldType,
    options: field.config.options?.map(({ label }) => label).join(", ") ?? "",
  };
}
