import { Copy, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type {
  DuplicateTaskTableMode,
  WorkbenchTaskTableSummary,
} from "../../../../shared/workbench-tasks";
import { useLocalization } from "../../../localization/LocalizationProvider";
import {
  beginNativeDrag,
  finishNativeDrag,
} from "../../drag/native-drag-feedback";
import { DragHandle } from "../../drag/DragHandle";

type TaskTableNavigationProps = {
  tables: WorkbenchTaskTableSummary[];
  selectedTableId?: string;
  onSelect: (tableId: string) => void;
  onRename: (
    table: WorkbenchTaskTableSummary,
    name: string,
  ) => Promise<boolean>;
  onDuplicate: (
    table: WorkbenchTaskTableSummary,
    mode: DuplicateTaskTableMode,
  ) => Promise<void>;
  onDelete: (table: WorkbenchTaskTableSummary) => void;
  onMove: (
    table: WorkbenchTaskTableSummary,
    position: number,
  ) => Promise<void>;
};

export function TaskTableNavigation({
  tables,
  selectedTableId,
  onSelect,
  onRename,
  onDuplicate,
  onDelete,
  onMove,
}: TaskTableNavigationProps): JSX.Element {
  const { t } = useLocalization();
  const [editingId, setEditingId] = useState<string>();
  const [draftName, setDraftName] = useState("");
  const [copyMenuId, setCopyMenuId] = useState<string>();
  const [draggedTableId, setDraggedTableId] = useState<string>();
  const [dropTargetTableId, setDropTargetTableId] = useState<string>();
  const committingRef = useRef(false);
  const copyMenuRef = useRef<HTMLDivElement>(null);
  const copyTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!copyMenuId) return;
    const closeOnOutsidePointer = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (
        copyMenuRef.current?.contains(target) ||
        copyTriggerRef.current?.contains(target)
      ) {
        return;
      }
      setCopyMenuId(undefined);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [copyMenuId]);

  const beginRename = (table: WorkbenchTaskTableSummary): void => {
    setCopyMenuId(undefined);
    setEditingId(table.id);
    setDraftName(table.name);
  };

  const cancelRename = (): void => {
    committingRef.current = false;
    setEditingId(undefined);
    setDraftName("");
  };

  const commitRename = async (
    table: WorkbenchTaskTableSummary,
  ): Promise<void> => {
    if (committingRef.current) return;
    const name = draftName.trim();
    if (!name || name === table.name) {
      cancelRename();
      return;
    }
    committingRef.current = true;
    const saved = await onRename(table, name);
    committingRef.current = false;
    if (saved) cancelRename();
  };

  return (
    <div className="workbench-task-table-list">
      {tables.map((table, index) => (
        <div
          key={table.id}
          className="workbench-task-table-item"
          data-active={table.id === selectedTableId}
          data-editing={editingId === table.id}
          data-dragging={draggedTableId === table.id || undefined}
          data-drop-target={
            dropTargetTableId === table.id ? "before" : undefined
          }
          onDragOver={(event) => {
            event.preventDefault();
            if (event.dataTransfer) {
              event.dataTransfer.dropEffect = "move";
            }
            setDropTargetTableId(table.id);
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) {
              setDropTargetTableId(undefined);
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            const sourceId =
              draggedTableId ||
              event.dataTransfer?.getData(
                "application/x-realmflow-task-table",
              );
            const source = tables.find(({ id }) => id === sourceId);
            finishNativeDrag(
              event.currentTarget.parentElement?.querySelector<HTMLElement>(
                "[data-dragging='true']",
              ),
            );
            setDraggedTableId(undefined);
            setDropTargetTableId(undefined);
            if (source && source.id !== table.id) {
              void onMove(source, index);
            }
          }}
        >
          {editingId === table.id ? (
            <input name="workbench-tasks-rename-table" autoComplete="off"
              autoFocus
              className="workbench-task-table-name-input"
              aria-label={t("workbenchTasks.renameTable", {
                name: table.name,
              })}
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              onBlur={() => void commitRename(table)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void commitRename(table);
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  cancelRename();
                }
              }}
            />
          ) : (
            <div className="workbench-task-table-primary">
              <button
                type="button"
                className="workbench-task-table-select"
                onClick={() => onSelect(table.id)}
                onDoubleClick={() => beginRename(table)}
              >
                <span>{table.name}</span>
              </button>
            </div>
          )}
          {editingId === table.id ? null : (
            <div className="workbench-task-table-actions">
              <DragHandle
                className="workbench-task-drag-handle"
                name={table.name}
                draggable
                onDragStart={(event) => {
                  const row = event.currentTarget.closest<HTMLElement>(
                    ".workbench-task-table-item",
                  )!;
                  beginNativeDrag(event, row);
                  setDraggedTableId(table.id);
                  if (event.dataTransfer) {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData(
                      "application/x-realmflow-task-table",
                      table.id,
                    );
                  }
                }}
                onDragEnd={(event) => {
                  finishNativeDrag(
                    event.currentTarget.closest<HTMLElement>(
                      ".workbench-task-table-item",
                    ),
                  );
                  setDraggedTableId(undefined);
                  setDropTargetTableId(undefined);
                }}
              />
              <button
                ref={copyMenuId === table.id ? copyTriggerRef : undefined}
                type="button"
                aria-label={t("workbenchTasks.duplicateTable", {
                  name: table.name,
                })}
                title={t("tooltip.duplicate")}
                aria-expanded={copyMenuId === table.id}
                onClick={() =>
                  setCopyMenuId((current) =>
                    current === table.id ? undefined : table.id,
                  )
                }
              >
                <Copy size={13} />
              </button>
              <button
                type="button"
                className="danger"
                aria-label={t("workbenchTasks.deleteTable", {
                  name: table.name,
                })}
                title={t("tooltip.delete")}
                onClick={() => onDelete(table)}
              >
                <Trash2 size={13} />
              </button>
            </div>
          )}
          {copyMenuId === table.id ? (
            <div
              ref={copyMenuRef}
              className="workbench-task-copy-menu"
              role="menu"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setCopyMenuId(undefined);
                  void onDuplicate(table, "structure");
                }}
              >
                {t("workbenchTasks.copyStructure")}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setCopyMenuId(undefined);
                  void onDuplicate(table, "structure_and_data");
                }}
              >
                {t("workbenchTasks.copyWithData")}
              </button>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
