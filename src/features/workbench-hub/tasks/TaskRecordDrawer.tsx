import { X } from "lucide-react";
import { useState } from "react";
import type { WorkbenchAttachmentApi } from "../../../../shared/workbench-attachments";
import type {
  WorkbenchTaskApi,
  WorkbenchTaskField,
  WorkbenchTaskRecord,
  WorkbenchTaskRecordValues,
} from "../../../../shared/workbench-tasks";
import {
  Button,
  Drawer,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  Field,
  IconButton,
} from "../../../components/ui";
import { useLocalization } from "../../../localization/LocalizationProvider";
import { TaskAttachmentField } from "./TaskAttachmentField";
import { TaskMultiSelectTagEditor } from "./TaskMultiSelectTagEditor";

type TaskRecordDrawerProps = {
  fields: WorkbenchTaskField[];
  record?: WorkbenchTaskRecord;
  attachments: WorkbenchAttachmentApi;
  tasks: WorkbenchTaskApi;
  saving: boolean;
  onClose: () => void;
  onRecordUpdated: (record: WorkbenchTaskRecord) => void;
  onSave: (
    values: WorkbenchTaskRecordValues,
    continueAdding: boolean,
  ) => Promise<void>;
};

export function TaskRecordDrawer({
  fields,
  record,
  attachments,
  tasks,
  saving,
  onClose,
  onRecordUpdated,
  onSave,
}: TaskRecordDrawerProps): JSX.Element {
  const { t } = useLocalization();
  const [values, setValues] = useState<WorkbenchTaskRecordValues>(
    record?.values ?? {},
  );
  const [continueAdding, setContinueAdding] = useState(false);
  const title = t(
    record ? "workbenchTasks.editRecord" : "workbenchTasks.createRecord",
  );

  const updateValue = (
    fieldId: string,
    value: WorkbenchTaskRecordValues[string],
  ): void => {
    setValues((current) => ({ ...current, [fieldId]: value }));
  };

  return (
    <Drawer
      open
      size="default"
      className="workbench-task-drawer"
      aria-label={title}
      locked={saving}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onSave(values, continueAdding);
        }}
      >
        <DrawerHeader>
          <strong>{title}</strong>
          <IconButton
            type="button"
            size="compact"
            variant="ghost"
            aria-label={t("workbenchHub.close")}
            title={t("workbenchHub.close")}
            disabled={saving}
            onClick={onClose}
          >
            <X size={16} />
          </IconButton>
        </DrawerHeader>
        <DrawerBody className="workbench-task-drawer-fields">
          {fields.map((field) => (
            <TaskFieldInput
              key={field.id}
              field={field}
              record={record}
              value={values[field.id]}
              attachments={attachments}
              tasks={tasks}
              onChange={(value) => updateValue(field.id, value)}
              onRecordUpdated={onRecordUpdated}
            />
          ))}
        </DrawerBody>
        <DrawerFooter>
          {record ? null : (
            <label>
              <input name="task-record-drawer-continue-adding" autoComplete="off"
                type="checkbox"
                checked={continueAdding}
                onChange={(event) => setContinueAdding(event.target.checked)}
              />
              {t("workbenchTasks.continueAdding")}
            </label>
          )}
          <Button type="button" onClick={onClose}>
            {t("workbenchTasks.cancel")}
          </Button>
          <Button type="submit" variant="primary" loading={saving}>
            {saving ? t("workbenchTasks.saving") : t("workbenchTasks.save")}
          </Button>
        </DrawerFooter>
      </form>
    </Drawer>
  );
}

function TaskFieldInput({
  field,
  record,
  value,
  attachments,
  tasks,
  onChange,
  onRecordUpdated,
}: {
  field: WorkbenchTaskField;
  record?: WorkbenchTaskRecord;
  value: WorkbenchTaskRecordValues[string] | undefined;
  attachments: WorkbenchAttachmentApi;
  tasks: WorkbenchTaskApi;
  onChange: (value: WorkbenchTaskRecordValues[string]) => void;
  onRecordUpdated: (record: WorkbenchTaskRecord) => void;
}): JSX.Element {
  const id = `task-record-field-${field.id}`;
  if (field.fieldType === "single_select") {
    return (
      <Field name={`task-record-${record?.id ?? "new"}-${field.id}`} label={field.name}>
        <select
          id={id}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="" />
          {field.config.options?.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>
    );
  }
  if (field.fieldType === "multi_select") {
    return (
      <div className="workbench-task-field">
        <span id={`${id}-label`}>{field.name}</span>
        <TaskMultiSelectTagEditor
          id={id}
          ariaLabel={field.name}
          options={field.config.options ?? []}
          value={Array.isArray(value) ? value : []}
          onChange={onChange}
        />
      </div>
    );
  }
  if (field.fieldType === "attachment") {
    return (
      <TaskAttachmentField
        field={field}
        record={record}
        value={value}
        attachments={attachments}
        tasks={tasks}
        onChange={onChange}
        onRecordUpdated={onRecordUpdated}
      />
    );
  }
  const inputType =
    field.fieldType === "date"
      ? "date"
      : field.fieldType === "url"
        ? "url"
        : "text";
  const displayValue =
    field.fieldType === "date" && typeof value === "number"
      ? new Date(value).toISOString().slice(0, 10)
      : typeof value === "string"
        ? value
        : "";
  return (
    <Field name={`task-record-${record?.id ?? "new"}-${field.id}`} label={field.name}>
      <input
        id={id}
        type={inputType}
        value={displayValue}
        onChange={(event) =>
          onChange(
            field.fieldType === "date"
              ? new Date(`${event.target.value}T00:00:00`).getTime()
              : event.target.value,
          )
        }
      />
    </Field>
  );
}
