import { Paperclip } from "lucide-react";
import {
  Fragment,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  TaskGroupNode,
  WorkbenchTaskField,
  WorkbenchTaskRecord,
  WorkbenchTaskRecordValue,
} from "../../../../shared/workbench-tasks";
import {
  beginNativeDrag,
  finishNativeDrag,
} from "../../drag/native-drag-feedback";
import { DragHandle } from "../../drag/DragHandle";
import { DataTable } from "../../../components/ui";
import { TaskTableFieldTypeIcon } from "./TaskTableFieldTypeIcon";
import { TaskMultiSelectTagEditor } from "./TaskMultiSelectTagEditor";

const DEFAULT_COLUMN_WIDTH = 180;
const MIN_COLUMN_WIDTH = 96;
const MAX_COLUMN_WIDTH = 480;
const DRAG_COLUMN_WIDTH = 20;
const SELECT_COLUMN_WIDTH = 24;

type TaskTableGridProps = {
  name: string;
  fields: WorkbenchTaskField[];
  records: WorkbenchTaskRecord[];
  groupTree: TaskGroupNode[];
  ungroupedLabel: string;
  selectedRecordIds: ReadonlySet<string>;
  selectAllLabel: string;
  getSelectRecordLabel: (record: WorkbenchTaskRecord) => string;
  getRecordName: (record: WorkbenchTaskRecord) => string;
  getResizeColumnLabel: (field: WorkbenchTaskField) => string;
  onToggleRecord: (recordId: string) => void;
  onToggleAll: () => void;
  onUpdateCell: (
    record: WorkbenchTaskRecord,
    field: WorkbenchTaskField,
    value: WorkbenchTaskRecordValue,
  ) => Promise<boolean>;
  onMoveRecord: (
    source: WorkbenchTaskRecord,
    target: WorkbenchTaskRecord,
  ) => Promise<void>;
};

type EditingCell = {
  recordId: string;
  fieldId: string;
  value: WorkbenchTaskRecordValue;
};

export function TaskTableGrid({
  name,
  fields,
  records,
  groupTree,
  ungroupedLabel,
  selectedRecordIds,
  selectAllLabel,
  getSelectRecordLabel,
  getRecordName,
  getResizeColumnLabel,
  onToggleRecord,
  onToggleAll,
  onUpdateCell,
  onMoveRecord,
}: TaskTableGridProps): JSX.Element {
  const [editing, setEditing] = useState<EditingCell>();
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [draggedRecordId, setDraggedRecordId] = useState<string>();
  const [dropTargetRecordId, setDropTargetRecordId] = useState<string>();
  const [hoveredResizeFieldId, setHoveredResizeFieldId] = useState<string>();
  const [focusedResizeFieldId, setFocusedResizeFieldId] = useState<string>();
  const [dragResizeFieldId, setDragResizeFieldId] = useState<string>();
  const resizeRef = useRef<{
    fieldId: string;
    startX: number;
    startWidth: number;
  }>();
  const activeResizeFieldId =
    dragResizeFieldId ?? focusedResizeFieldId ?? hoveredResizeFieldId;
  const selectedVisibleCount = records.filter(({ id }) =>
    selectedRecordIds.has(id)
  ).length;
  const allVisibleSelected =
    records.length > 0 && selectedVisibleCount === records.length;
  const someVisibleSelected =
    selectedVisibleCount > 0 && !allVisibleSelected;
  const recordGroups = buildRecordGroups(
    records,
    fields,
    groupTree,
    ungroupedLabel,
  );
  const commit = async (
    record: WorkbenchTaskRecord,
    field: WorkbenchTaskField,
    value: WorkbenchTaskRecordValue,
  ): Promise<void> => {
    if (await onUpdateCell(record, field, value)) setEditing(undefined);
  };

  const columnWidth = (fieldId: string): number =>
    columnWidths[fieldId] ?? DEFAULT_COLUMN_WIDTH;

  const setColumnWidth = (fieldId: string, width: number): void => {
    const nextWidth = Math.min(
      MAX_COLUMN_WIDTH,
      Math.max(MIN_COLUMN_WIDTH, width),
    );
    setColumnWidths((current) => ({ ...current, [fieldId]: nextWidth }));
  };

  const resizeColumn = (
    event: ReactPointerEvent<HTMLDivElement>,
  ): void => {
    const resize = resizeRef.current;
    if (!resize) return;
    setColumnWidth(
      resize.fieldId,
      resize.startWidth + event.clientX - resize.startX,
    );
  };

  const resizeColumnWithKeyboard = (
    event: ReactKeyboardEvent<HTMLDivElement>,
    fieldId: string,
  ): void => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    setColumnWidth(
      fieldId,
      columnWidth(fieldId) + (event.key === "ArrowRight" ? 8 : -8),
    );
  };
  const tableWidth =
    DRAG_COLUMN_WIDTH +
    SELECT_COLUMN_WIDTH +
    fields.reduce(
      (total, field) => total + columnWidth(field.id),
      0,
    );

  return (
      <DataTable
        caption={name}
        density="compact"
        scrollClassName="workbench-task-grid-scroll"
        className="workbench-task-table"
        aria-label={name}
        style={{ width: `max(100%, ${tableWidth}px)` }}
      >
        <colgroup>
          <col
            className="workbench-task-drag-column"
            style={{ width: `${DRAG_COLUMN_WIDTH}px` }}
          />
          <col
            className="workbench-task-select-column"
            style={{ width: `${SELECT_COLUMN_WIDTH}px` }}
          />
          {fields.map((field) => (
            <col
              key={field.id}
              data-field-id={field.id}
              style={{ width: `${columnWidth(field.id)}px` }}
            />
          ))}
          <col className="workbench-task-fill-column" />
        </colgroup>
        <thead className="workbench-task-table-head">
          <tr>
            <th className="workbench-task-drag-column" aria-hidden="true" />
            <th className="workbench-task-select-column" scope="col">
              <SelectionCheckbox
                name="task-record-select-all"
                ariaLabel={selectAllLabel}
                checked={allVisibleSelected}
                indeterminate={someVisibleSelected}
                onChange={onToggleAll}
              />
            </th>
            {fields.map((field) => (
              <th
                key={field.id}
                scope="col"
                aria-label={field.name}
                data-resize-active={
                  activeResizeFieldId === field.id ? "true" : undefined
                }
              >
                <span className="workbench-task-field-header">
                  <TaskTableFieldTypeIcon fieldType={field.fieldType} />
                  <span>{field.name}</span>
                </span>
                <div
                  className="workbench-task-column-resizer"
                  role="separator"
                  aria-label={getResizeColumnLabel(field)}
                  aria-orientation="vertical"
                  aria-valuemin={MIN_COLUMN_WIDTH}
                  aria-valuemax={MAX_COLUMN_WIDTH}
                  aria-valuenow={columnWidth(field.id)}
                  tabIndex={0}
                  onPointerEnter={() => setHoveredResizeFieldId(field.id)}
                  onPointerLeave={() =>
                    setHoveredResizeFieldId((current) =>
                      current === field.id ? undefined : current,
                    )
                  }
                  onFocus={() => setFocusedResizeFieldId(field.id)}
                  onBlur={() =>
                    setFocusedResizeFieldId((current) =>
                      current === field.id ? undefined : current,
                    )
                  }
                  onKeyDown={(event) =>
                    resizeColumnWithKeyboard(event, field.id)
                  }
                  onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    resizeRef.current = {
                      fieldId: field.id,
                      startX: event.clientX,
                      startWidth: columnWidth(field.id),
                    };
                    setDragResizeFieldId(field.id);
                  }}
                  onPointerMove={resizeColumn}
                  onPointerUp={(event) => {
                    event.currentTarget.releasePointerCapture(event.pointerId);
                    resizeRef.current = undefined;
                    setDragResizeFieldId(undefined);
                  }}
                  onPointerCancel={() => {
                    resizeRef.current = undefined;
                    setDragResizeFieldId(undefined);
                  }}
                />
              </th>
            ))}
            <th className="workbench-task-fill-column" aria-hidden="true" />
          </tr>
        </thead>
        <tbody>
          {recordGroups.map((group) => (
            <Fragment key={group.key}>
              {group.label ? (
                <tr
                  className="workbench-task-group-row"
                  data-depth={group.depth}
                >
                  <th
                    colSpan={fields.length + 3}
                    style={{ paddingLeft: `${12 + group.depth * 16}px` }}
                  >
                    {group.label} · {group.count}
                  </th>
                </tr>
              ) : null}
              {group.records.map((record, groupRecordIndex) => {
                const selected = selectedRecordIds.has(record.id);
                return (
                <tr
                  key={record.id}
                  data-selected={selected}
                  data-dragging={draggedRecordId === record.id || undefined}
                  data-drop-target={
                    dropTargetRecordId === record.id ? "before" : undefined
                  }
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (event.dataTransfer) {
                      event.dataTransfer.dropEffect = "move";
                    }
                    setDropTargetRecordId(record.id);
                  }}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                      setDropTargetRecordId(undefined);
                    }
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const source = records.find(
                      ({ id }) => id === draggedRecordId,
                    );
                    finishNativeDrag(
                      event.currentTarget.parentElement?.querySelector<HTMLElement>(
                        "[data-dragging='true']",
                      ),
                    );
                    setDraggedRecordId(undefined);
                    setDropTargetRecordId(undefined);
                    if (source && source.id !== record.id) {
                      void onMoveRecord(source, record);
                    }
                  }}
                >
                  <td
                    className="workbench-task-drag-column"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <DragHandle
                      className="workbench-task-record-drag"
                      name={getRecordName(record)}
                      draggable
                      onDragStart={(event) => {
                        event.stopPropagation();
                        if (event.dataTransfer) {
                          event.dataTransfer.effectAllowed = "move";
                        }
                        beginNativeDrag(event, event.currentTarget.closest("tr")!);
                        setDraggedRecordId(record.id);
                      }}
                      onDragEnd={(event) => {
                        finishNativeDrag(event.currentTarget.closest("tr"));
                        setDraggedRecordId(undefined);
                        setDropTargetRecordId(undefined);
                      }}
                    />
                  </td>
                  <td
                    className="workbench-task-select-column"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <span
                      className="workbench-task-record-index"
                      aria-hidden="true"
                    >
                      {groupRecordIndex + 1}
                    </span>
                    <SelectionCheckbox
                      className="workbench-task-select-control"
                      name={`task-record-${record.id}-selected`}
                      ariaLabel={getSelectRecordLabel(record)}
                      checked={selected}
                      indeterminate={false}
                      onChange={() => onToggleRecord(record.id)}
                    />
                  </td>
                  {fields.map((field) => {
                    const isEditing =
                      editing?.recordId === record.id &&
                      editing.fieldId === field.id;
                    return (
                      <td
                        key={field.id}
                        data-resize-active={
                          activeResizeFieldId === field.id ? "true" : undefined
                        }
                        onClick={(event) => event.stopPropagation()}
                      >
                        {isEditing ? (
                          <InlineEditor
                            field={field}
                            recordId={record.id}
                            recordName={getRecordName(record)}
                            value={editing.value}
                            onChange={(value) =>
                              setEditing({ ...editing, value })
                            }
                            onCommit={(value = editing.value) =>
                              void commit(record, field, value)
                            }
                            onCancel={() => setEditing(undefined)}
                          />
                        ) : (
                          <button
                            type="button"
                            className="workbench-task-cell"
                            aria-label={cellLabel(
                              field,
                              record.values[field.id],
                            )}
                            onClick={() =>
                              setEditing({
                                recordId: record.id,
                                fieldId: field.id,
                                value: initialValue(
                                  field,
                                  record.values[field.id],
                                ),
                              })
                            }
                          >
                            <CellValue
                              field={field}
                              value={record.values[field.id]}
                            />
                          </button>
                        )}
                      </td>
                    );
                  })}
                  <td className="workbench-task-fill-column" aria-hidden="true" />
                </tr>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </DataTable>
  );
}

function buildRecordGroups(
  records: WorkbenchTaskRecord[],
  fields: WorkbenchTaskField[],
  groupTree: TaskGroupNode[],
  ungroupedLabel: string,
): Array<{
  key: string;
  label?: string;
  count: number;
  depth: number;
  records: WorkbenchTaskRecord[];
}> {
  if (groupTree.length === 0) {
    return [{ key: "all", count: records.length, depth: 0, records }];
  }
  const fieldById = new Map(fields.map((field) => [field.id, field]));
  const recordById = new Map(records.map((record) => [record.id, record]));
  const result: Array<{
    key: string;
    label?: string;
    count: number;
    depth: number;
    records: WorkbenchTaskRecord[];
  }> = [];
  const visit = (
    nodes: TaskGroupNode[],
    depth: number,
    parentKey: string,
  ): void => {
    for (const node of nodes) {
      const field = fieldById.get(node.fieldId);
      const option = field?.config.options?.find(({ id }) => id === node.value);
      const valueKey = node.value === null ? "null" : String(node.value);
      const key = `${parentKey}/${node.fieldId}:${valueKey}`;
      result.push({
        key,
        label:
          node.value === null
            ? ungroupedLabel
            : option?.label ?? String(node.value),
        count: node.count,
        depth,
        records: node.recordIds.flatMap((id) => {
          const record = recordById.get(id);
          return record ? [record] : [];
        }),
      });
      visit(node.children, depth + 1, key);
    }
  };
  visit(groupTree, 0, "root");
  return result;
}

function SelectionCheckbox({
  className,
  name,
  ariaLabel,
  checked,
  indeterminate,
  onChange,
}: {
  className?: string;
  name: string;
  ariaLabel: string;
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
}): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={inputRef}
      className={className}
      type="checkbox"
      name={name}
      autoComplete="off"
      aria-label={ariaLabel}
      checked={checked}
      onChange={onChange}
    />
  );
}

function InlineEditor({
  field,
  recordId,
  recordName,
  value,
  onChange,
  onCommit,
  onCancel,
}: {
  field: WorkbenchTaskField;
  recordId: string;
  recordName: string;
  value: WorkbenchTaskRecordValue;
  onChange: (value: WorkbenchTaskRecordValue) => void;
  onCommit: (value?: WorkbenchTaskRecordValue) => void;
  onCancel: () => void;
}): JSX.Element {
  const name = `task-record-${recordId}-${field.id}`;
  const accessibleName = `${recordName} · ${field.name}`;
  if (field.fieldType === "multi_select") {
    return (
      <TaskMultiSelectTagEditor
        options={field.config.options ?? []}
        value={Array.isArray(value) ? value : []}
        ariaLabel={accessibleName}
        autoOpen
        onChange={onChange}
        onCommit={onCommit}
        onCancel={onCancel}
      />
    );
  }
  if (field.fieldType === "single_select") {
    return (
      <select
        autoFocus
        name={name}
        autoComplete="off"
        aria-label={accessibleName}
        value={typeof value === "string" ? value : ""}
        onChange={(event) => {
          const nextValue = event.target.value;
          onChange(nextValue);
          onCommit(nextValue);
        }}
        onBlur={onCancel}
      >
        <option value="" />
        {field.config.options?.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }
  const displayValue =
    field.fieldType === "date" && typeof value === "number"
      ? new Date(value).toISOString().slice(0, 10)
      : typeof value === "string"
        ? value
        : "";
  return (
    <input
      autoFocus
      name={name}
      autoComplete="off"
      aria-label={accessibleName}
      type={
        field.fieldType === "date"
          ? "date"
          : field.fieldType === "url"
            ? "url"
            : "text"
      }
      inputMode={field.fieldType === "url" ? "url" : undefined}
      spellCheck={field.fieldType !== "url"}
      value={displayValue}
      onChange={(event) =>
        onChange(
          field.fieldType === "date"
            ? new Date(`${event.target.value}T00:00:00`).getTime()
            : event.target.value,
        )
      }
      onBlur={() => onCommit()}
      onKeyDown={(event) => {
        if (event.key === "Enter") onCommit();
        if (event.key === "Escape") onCancel();
      }}
    />
  );
}

function CellValue({
  field,
  value,
}: {
  field: WorkbenchTaskField;
  value?: WorkbenchTaskRecordValue;
}): JSX.Element {
  if (value === undefined || value === "") return <span className="empty">-</span>;
  if (field.fieldType === "date" && typeof value === "number") {
    return <>{new Intl.DateTimeFormat().format(value)}</>;
  }
  if (
    (field.fieldType === "single_select" ||
      field.fieldType === "multi_select") &&
    (typeof value === "string" || Array.isArray(value))
  ) {
    const ids = Array.isArray(value) ? value : [value];
    return (
      <span className="workbench-task-options">
        {ids.map((id) => {
          const option = field.config.options?.find((item) => item.id === id);
          return (
            <span key={id} data-color={option?.color ?? "gray"}>
              {option?.label ?? id}
            </span>
          );
        })}
      </span>
    );
  }
  if (field.fieldType === "attachment" && Array.isArray(value)) {
    return (
      <span className="workbench-task-attachment-count">
        <Paperclip size={13} />
        {value.length}
      </span>
    );
  }
  return <>{String(value)}</>;
}

function cellLabel(
  field: WorkbenchTaskField,
  value?: WorkbenchTaskRecordValue,
): string {
  if (
    (field.fieldType === "single_select" ||
      field.fieldType === "multi_select") &&
    (typeof value === "string" || Array.isArray(value))
  ) {
    const ids = Array.isArray(value) ? value : [value];
    return ids
      .map(
        (id) =>
          field.config.options?.find((option) => option.id === id)?.label ?? id,
      )
      .join(", ");
  }
  return value === undefined ? field.name : String(value);
}

function initialValue(
  field: WorkbenchTaskField,
  value?: WorkbenchTaskRecordValue,
): WorkbenchTaskRecordValue {
  if (value !== undefined) return value;
  if (
    field.fieldType === "multi_select" ||
    field.fieldType === "attachment"
  ) {
    return [];
  }
  if (field.fieldType === "date") return Date.now();
  return "";
}
