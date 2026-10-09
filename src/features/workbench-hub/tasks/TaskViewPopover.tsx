import { GripVertical, Plus, X } from "lucide-react";
import { type DragEvent, type RefObject, useRef, useState } from "react";
import type {
  TaskFilter,
  TaskFilterOperator,
  TaskGroup,
  TaskSort,
  TaskViewState,
  WorkbenchTaskField,
  WorkbenchTaskRecordValue,
} from "../../../../shared/workbench-tasks";
import { IconButton, Popover, PopoverContent } from "../../../components/ui";
import { useLocalization } from "../../../localization/LocalizationProvider";
import { useNativeListDrag } from "../../drag/use-native-list-drag";

export type TaskViewPopoverMode = "filter" | "group" | "sort";

type TaskViewPopoverProps = {
  mode: TaskViewPopoverMode;
  anchorRef: RefObject<HTMLButtonElement>;
  fields: WorkbenchTaskField[];
  viewState: TaskViewState;
  saving: boolean;
  onClose: () => void;
  onSave: (state: TaskViewState) => Promise<void>;
};

const FILTER_OPERATORS: TaskFilterOperator[] = [
  "contains",
  "not_contains",
  "equals",
  "not_equals",
  "is_empty",
  "is_not_empty",
  "before",
  "after",
];
export function TaskViewPopover({
  mode,
  anchorRef,
  fields,
  viewState,
  saving,
  onClose,
  onSave,
}: TaskViewPopoverProps): JSX.Element {
  const { t } = useLocalization();
  const [filters, setFilters] = useState<TaskFilter[]>(() =>
    viewState.filters.length > 0
      ? viewState.filters.map((filter) => ({ ...filter }))
      : [{ fieldId: "", operator: "contains", value: "" }],
  );
  const [groups, setGroups] = useState<TaskGroup[]>(() =>
    viewState.groups.map((group) => ({ ...group })),
  );
  const [sorts, setSorts] = useState<TaskSort[]>(() =>
    viewState.sorts.length > 0
      ? viewState.sorts.map((sort) => ({ ...sort }))
      : [{ fieldId: "", direction: "asc" }],
  );
  const popoverRef = useRef<HTMLDivElement>(null);
  const listDrag = useNativeListDrag(popoverRef);
  const defaultFieldId = fields[0]?.id ?? "";

  const saveFilters = async (next: TaskFilter[]): Promise<void> => {
    setFilters(
      next.length > 0
        ? next
        : [{ fieldId: "", operator: "contains", value: "" }],
    );
    if (next.length === 0) {
      await onSave({ ...viewState, filters: [] });
      return;
    }
    if (next.some((filter) => !filterIsComplete(filter))) return;
    await onSave({ ...viewState, filters: next });
  };

  const saveGroups = async (next: TaskGroup[]): Promise<void> => {
    setGroups(next);
    await onSave({ ...viewState, groups: next });
  };

  const saveSorts = async (next: TaskSort[]): Promise<void> => {
    setSorts(next.length > 0 ? next : [{ fieldId: "", direction: "asc" }]);
    if (next.length > 0 && next.some((sort) => !sort.fieldId)) return;
    await onSave({ ...viewState, sorts: next });
  };

  const reorder = <T,>(
    items: T[],
    sourceIndex: number,
    targetIndex: number,
  ): T[] => {
    const next = [...items];
    const [item] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, item);
    return next;
  };

  const title = t(
    mode === "filter"
      ? "workbenchTasks.filterPopoverTitle"
      : mode === "group"
        ? "workbenchTasks.groupPopoverTitle"
        : "workbenchTasks.sortPopoverTitle",
  );

  return (
    <Popover
      open
      trigger={anchorRef.current}
      placement="bottom-start"
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <PopoverContent
        ref={popoverRef}
        className={`workbench-task-view-popover ${mode}`}
        aria-label={title}
        aria-busy={saving}
      >
        <header>
          <strong>{title}</strong>
          <IconButton
            size="compact"
            variant="ghost"
            aria-label={t("workbenchHub.close")}
            title={t("workbenchHub.close")}
            onClick={onClose}
          >
            <X size={16} />
          </IconButton>
        </header>

        {mode === "filter" ? (
          <div className="workbench-task-view-popover-body">
            {filters.map((filter, index) => (
              <div
                className="workbench-task-condition-row filter"
                key={index}
                {...listDrag.targetProps(
                  index,
                  (source, target) =>
                    void saveFilters(reorder(filters, source, target)),
                )}
              >
                <DragHandle
                  label={t("workbenchTasks.moveFilter", { index: index + 1 })}
                  {...listDrag.sourceProps(index)}
                />
                <FieldSelect
                  label={t("workbenchTasks.filterField", { index: index + 1 })}
                  fields={fields}
                  value={filter.fieldId}
                  includePlaceholder={!filter.fieldId}
                  onChange={(fieldId) =>
                    void saveFilters(
                      replaceAt(filters, index, {
                        ...filter,
                        fieldId,
                        value: undefined,
                      }),
                    )
                  }
                />
                <label>
                  <span className="sr-only">
                    {t("workbenchTasks.filterOperator", { index: index + 1 })}
                  </span>
                  <select name="workbench-tasks-filter-operator" autoComplete="off"
                    aria-label={t("workbenchTasks.filterOperator", {
                      index: index + 1,
                    })}
                    value={filter.operator}
                    onChange={(event) =>
                      void saveFilters(
                        replaceAt(filters, index, {
                          ...filter,
                          operator: event.target.value as TaskFilterOperator,
                        }),
                      )
                    }
                  >
                    {FILTER_OPERATORS.map((operator) => (
                      <option key={operator} value={operator}>
                        {t(`workbenchTasks.operator.${operator}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <FilterValue
                  index={index}
                  field={fields.find(({ id }) => id === filter.fieldId)}
                  filter={filter}
                  onChange={(value, selectionMode) =>
                    void saveFilters(
                      replaceAt(filters, index, {
                        ...filter,
                        value,
                        ...(selectionMode ? { selectionMode } : {}),
                      }),
                    )
                  }
                />
                <RemoveButton
                  label={t("workbenchTasks.removeFilter", {
                    index: index + 1,
                  })}
                  onClick={() =>
                    void saveFilters(
                      filters.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                />
              </div>
            ))}
            <button
              type="button"
              className="workbench-task-add-condition"
              disabled={!defaultFieldId}
              onClick={() =>
                setFilters((current) => [
                  ...current,
                  {
                    fieldId: defaultFieldId,
                    operator: "contains",
                    value: "",
                  },
                ])
              }
            >
              <Plus size={14} />
              {t("workbenchTasks.addFilter")}
            </button>
          </div>
        ) : null}

        {mode === "group" ? (
          <div className="workbench-task-view-popover-body">
            {groups.length === 0 ? (
              <div className="workbench-task-condition-row group">
                <GripVertical size={14} aria-hidden="true" />
                <FieldSelect
                  label={t("workbenchTasks.groupFieldAt", { index: 1 })}
                  fields={fields}
                  value=""
                  includePlaceholder
                  onChange={(fieldId) =>
                    void saveGroups([{ fieldId, direction: "asc" }])
                  }
                />
                <DirectionControl
                  ascendingLabel={t("workbenchTasks.groupAscending")}
                  descendingLabel={t("workbenchTasks.groupDescending")}
                  direction="asc"
                  onChange={() => undefined}
                />
                <span />
              </div>
            ) : null}
            {groups.map((group, index) => (
              <div
                className="workbench-task-condition-row group"
                key={group.fieldId}
                {...listDrag.targetProps(
                  index,
                  (source, target) =>
                    void saveGroups(reorder(groups, source, target)),
                )}
              >
                <DragHandle
                  label={t("workbenchTasks.moveGroup", { index: index + 1 })}
                  {...listDrag.sourceProps(index)}
                />
                <FieldSelect
                  label={t("workbenchTasks.groupFieldAt", {
                    index: index + 1,
                  })}
                  fields={fields.filter(
                    (field) =>
                      field.id === group.fieldId ||
                      !groups.some(({ fieldId }) => fieldId === field.id),
                  )}
                  value={group.fieldId}
                  onChange={(fieldId) =>
                    void saveGroups(
                      replaceAt(groups, index, { ...group, fieldId }),
                    )
                  }
                />
                <DirectionControl
                  ascendingLabel={t("workbenchTasks.groupAscending")}
                  descendingLabel={t("workbenchTasks.groupDescending")}
                  direction={group.direction}
                  onChange={(direction) =>
                    void saveGroups(
                      replaceAt(groups, index, { ...group, direction }),
                    )
                  }
                />
                <RemoveButton
                  label={t("workbenchTasks.removeGroupAt", {
                    index: index + 1,
                  })}
                  onClick={() =>
                    void saveGroups(
                      groups.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                />
              </div>
            ))}
            <button
              type="button"
              className="workbench-task-add-condition"
              disabled={groups.length >= fields.length}
              onClick={() => {
                const field = fields.find(
                  ({ id }) => !groups.some(({ fieldId }) => fieldId === id),
                );
                if (field) {
                  void saveGroups([
                    ...groups,
                    { fieldId: field.id, direction: "asc" },
                  ]);
                }
              }}
            >
              <Plus size={14} />
              {t("workbenchTasks.addGroupCondition")}
            </button>
          </div>
        ) : null}

        {mode === "sort" ? (
          <div className="workbench-task-view-popover-body">
            {sorts.map((sort, index) => (
              <div
                className="workbench-task-condition-row sort"
                key={index}
                {...listDrag.targetProps(
                  index,
                  (source, target) =>
                    void saveSorts(reorder(sorts, source, target)),
                )}
              >
                <DragHandle
                  label={t("workbenchTasks.moveSort", { index: index + 1 })}
                  {...listDrag.sourceProps(index)}
                />
                <FieldSelect
                  label={t("workbenchTasks.sortField", { index: index + 1 })}
                  fields={fields}
                  value={sort.fieldId}
                  includePlaceholder={!sort.fieldId}
                  onChange={(fieldId) =>
                    void saveSorts(
                      replaceAt(sorts, index, { ...sort, fieldId }),
                    )
                  }
                />
                <DirectionControl
                  ascendingLabel={t("workbenchTasks.ascending")}
                  descendingLabel={t("workbenchTasks.descending")}
                  direction={sort.direction}
                  onChange={(direction) =>
                    void saveSorts(
                      replaceAt(sorts, index, { ...sort, direction }),
                    )
                  }
                />
                <RemoveButton
                  label={t("workbenchTasks.removeSort", { index: index + 1 })}
                  onClick={() =>
                    void saveSorts(
                      sorts.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                />
              </div>
            ))}
            <button
              type="button"
              className="workbench-task-add-condition"
              disabled={!defaultFieldId}
              onClick={() =>
                void saveSorts([
                  ...sorts,
                  { fieldId: defaultFieldId, direction: "asc" },
                ])
              }
            >
              <Plus size={14} />
              {t("workbenchTasks.addSortCondition")}
            </button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function DragHandle({
  label,
  onDragStart,
  onDragEnd,
}: {
  label: string;
  onDragStart: (event: DragEvent<HTMLButtonElement>) => void;
  onDragEnd: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className="workbench-task-condition-drag"
      draggable
      aria-label={label}
      title={label}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <GripVertical size={14} />
    </button>
  );
}

function FieldSelect({
  label,
  fields,
  value,
  includePlaceholder = false,
  onChange,
}: {
  label: string;
  fields: WorkbenchTaskField[];
  value: string;
  includePlaceholder?: boolean;
  onChange: (fieldId: string) => void;
}): JSX.Element {
  const { t } = useLocalization();
  return (
    <label>
      <span className="sr-only">{label}</span>
      <select name="task-view-popover-value" autoComplete="off"
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {includePlaceholder ? (
          <option value="">{t("workbenchTasks.chooseField")}</option>
        ) : null}
        {fields.map((field) => (
          <option key={field.id} value={field.id}>
            {field.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function DirectionControl({
  ascendingLabel,
  descendingLabel,
  direction,
  onChange,
}: {
  ascendingLabel: string;
  descendingLabel: string;
  direction: "asc" | "desc";
  onChange: (direction: "asc" | "desc") => void;
}): JSX.Element {
  return (
    <div className="workbench-task-direction" role="group">
      <button
        type="button"
        aria-pressed={direction === "asc"}
        onClick={() => onChange("asc")}
      >
        {ascendingLabel}
      </button>
      <button
        type="button"
        aria-pressed={direction === "desc"}
        onClick={() => onChange("desc")}
      >
        {descendingLabel}
      </button>
    </div>
  );
}

function RemoveButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className="workbench-task-condition-remove"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <X size={15} />
    </button>
  );
}

function FilterValue({
  index,
  field,
  filter,
  onChange,
}: {
  index: number;
  field?: WorkbenchTaskField;
  filter: TaskFilter;
  onChange: (
    value: WorkbenchTaskRecordValue,
    selectionMode?: "any" | "all",
  ) => void;
}): JSX.Element {
  const { t } = useLocalization();
  const label = t("workbenchTasks.filterValue", { index: index + 1 });
  if (filter.operator === "is_empty" || filter.operator === "is_not_empty") {
    return <span className="workbench-task-view-empty-value">-</span>;
  }
  if (field?.fieldType === "single_select") {
    return (
      <label>
        <span className="sr-only">{label}</span>
        <select name={`task-filter-${index}-${field?.id ?? "unknown"}-value`} autoComplete="off"
          aria-label={label}
          value={typeof filter.value === "string" ? filter.value : ""}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="" />
          {field.config.options?.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (field?.fieldType === "multi_select") {
    return (
      <label>
        <span className="sr-only">{label}</span>
        <select name={`task-filter-${index}-${field?.id ?? "unknown"}-value`} autoComplete="off"
          multiple
          aria-label={label}
          value={Array.isArray(filter.value) ? filter.value : []}
          onChange={(event) =>
            onChange(
              [...event.target.selectedOptions].map(({ value }) => value),
              filter.selectionMode ?? "any",
            )
          }
        >
          {field.config.options?.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <label>
      <span className="sr-only">{label}</span>
      <input name={`task-filter-${index}-${field?.id ?? "unknown"}-value`} autoComplete="off"
        aria-label={label}
        type={field?.fieldType === "date" ? "date" : "text"}
        value={
          field?.fieldType === "date" && typeof filter.value === "number"
            ? new Date(filter.value).toISOString().slice(0, 10)
            : typeof filter.value === "string"
              ? filter.value
              : ""
        }
        onChange={(event) =>
          onChange(
            field?.fieldType === "date"
              ? new Date(`${event.target.value}T00:00:00`).getTime()
              : event.target.value,
          )
        }
      />
    </label>
  );
}

function filterIsComplete(filter: TaskFilter): boolean {
  if (!filter.fieldId) return false;
  if (filter.operator === "is_empty" || filter.operator === "is_not_empty") {
    return true;
  }
  if (Array.isArray(filter.value)) return filter.value.length > 0;
  if (typeof filter.value === "number") return Number.isFinite(filter.value);
  return typeof filter.value === "string" && filter.value.trim().length > 0;
}

function replaceAt<T>(items: T[], index: number, value: T): T[] {
  return items.map((item, itemIndex) => (itemIndex === index ? value : item));
}
