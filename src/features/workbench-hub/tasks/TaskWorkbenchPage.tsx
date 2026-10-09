import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { WorkbenchAttachmentApi } from "../../../../shared/workbench-attachments";
import type {
  TaskViewState,
  WorkbenchTaskApi,
  WorkbenchTaskField,
  WorkbenchTaskFieldType,
  WorkbenchTaskRecord,
  WorkbenchTaskRecordValue,
  WorkbenchTaskRecordValues,
  WorkbenchTaskTableSnapshot,
  WorkbenchTaskTableSummary,
} from "../../../../shared/workbench-tasks";
import { EmptyState, InlineAlert } from "../../../components/ui";
import { useLocalization } from "../../../localization/LocalizationProvider";
import { WorkbenchSplitPage } from "../WorkbenchSplitPage";
import { TaskRecordDrawer } from "./TaskRecordDrawer";
import { TaskConfirmDialog } from "./TaskDialogs";
import {
  fieldConfigFromDraft,
  TaskFieldManagerDialog,
  type TaskFieldDraft,
} from "./TaskFieldManagerDialog";
import { TaskPagination } from "./TaskPagination";
import { TaskTableGrid } from "./TaskTableGrid";
import { TaskTableNavigation } from "./TaskTableNavigation";
import { TaskViewPopover, type TaskViewPopoverMode } from "./TaskViewPopover";
import { TaskWorkbenchToolbar } from "./TaskWorkbenchToolbar";
import { taskRecordDisplayName, taskRequestId } from "./task-ui-utils";
import { useTaskTableManagement } from "./use-task-table-management";

type TaskWorkbenchPageProps = {
  api?: WorkbenchTaskApi;
  attachmentsApi?: WorkbenchAttachmentApi;
};

export function TaskWorkbenchPage({
  api = window.realmflow?.workbenchHub?.tasks,
  attachmentsApi = window.realmflow?.workbenchHub?.attachments,
}: TaskWorkbenchPageProps): JSX.Element {
  const { t } = useLocalization();
  const {
    tables,
    selectedTableId,
    selectedTable,
    snapshot,
    loading,
    error,
    setTables,
    setSelectedTableId,
    setSnapshot,
    setError,
    syncTableSummary,
    reloadSelected,
    createTable,
    renameTable,
    duplicateTable,
    moveTable,
    deleteTable: removeTable,
    loadPage,
  } = useTaskTableManagement(api);
  const [recordDrawer, setRecordDrawer] = useState<
    WorkbenchTaskRecord | "new"
  >();
  const [savingRecord, setSavingRecord] = useState(false);
  const [deleteTableCandidate, setDeleteTableCandidate] =
    useState<WorkbenchTaskTableSummary>();
  const [fieldDialogOpen, setFieldDialogOpen] = useState(false);
  const [savingField, setSavingField] = useState(false);
  const [deleteFieldCandidate, setDeleteFieldCandidate] =
    useState<WorkbenchTaskField>();
  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [deleteRecordsOpen, setDeleteRecordsOpen] = useState(false);
  const [deletingRecords, setDeletingRecords] = useState(false);
  const [activeViewPopover, setActiveViewPopover] =
    useState<TaskViewPopoverMode>();
  const [savingView, setSavingView] = useState(false);
  const deleteFocusRef = useRef<HTMLElement>();
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const groupButtonRef = useRef<HTMLButtonElement>(null);
  const sortButtonRef = useRef<HTMLButtonElement>(null);
  const snapshotRef = useRef<WorkbenchTaskTableSnapshot>();
  const viewSaveQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    setSelectedRecordIds(new Set());
    setDeleteRecordsOpen(false);
  }, [selectedTableId]);

  const deleteTable = async (): Promise<void> => {
    if (deleteTableCandidate && (await removeTable(deleteTableCandidate))) {
      setDeleteTableCandidate(undefined);
    }
  };

  const saveRecord = async (
    values: WorkbenchTaskRecordValues,
    continueAdding: boolean,
  ): Promise<void> => {
    if (!api || !snapshot || !recordDrawer) return;
    setSavingRecord(true);
    setError(undefined);
    try {
      if (recordDrawer === "new") {
        const created = await api.createRecord({
          requestId: taskRequestId(),
          tableId: snapshot.table.id,
          values,
        });
        syncTableSummary({
          ...snapshot,
          records: [...snapshot.records, created],
          total: snapshot.total + 1,
        });
        setRecordDrawer(continueAdding ? "new" : undefined);
      } else {
        const result = await api.updateRecord({
          requestId: taskRequestId(),
          tableId: snapshot.table.id,
          recordId: recordDrawer.id,
          expectedRevision: recordDrawer.revision,
          values,
        });
        if (!result.ok) {
          await reloadSelected();
          setError(t("workbenchTasks.conflict"));
          return;
        }
        replaceRecord(result.value);
        setRecordDrawer(undefined);
      }
    } catch {
      setError(t("workbenchTasks.saveFailed"));
    } finally {
      setSavingRecord(false);
    }
  };

  const updateCell = async (
    record: WorkbenchTaskRecord,
    field: WorkbenchTaskField,
    value: WorkbenchTaskRecordValue,
  ): Promise<boolean> => {
    if (!api || !snapshot) return false;
    try {
      const result = await api.updateRecord({
        requestId: taskRequestId(),
        tableId: snapshot.table.id,
        recordId: record.id,
        expectedRevision: record.revision,
        values: { [field.id]: value },
      });
      if (!result.ok) {
        await reloadSelected();
        setError(t("workbenchTasks.conflict"));
        return false;
      }
      replaceRecord(result.value);
      return true;
    } catch {
      setError(t("workbenchTasks.saveFailed"));
      return false;
    }
  };

  const moveRecord = async (
    source: WorkbenchTaskRecord,
    target: WorkbenchTaskRecord,
  ): Promise<void> => {
    if (!api || !snapshot || source.id === target.id) return;
    const targetIndex = snapshot.records.findIndex(
      ({ id }) => id === target.id,
    );
    if (targetIndex < 0) return;
    setError(undefined);
    try {
      const result = await api.updateRecord({
        requestId: taskRequestId(),
        tableId: snapshot.table.id,
        recordId: source.id,
        expectedRevision: source.revision,
        position: targetIndex,
      });
      if (!result.ok) {
        await reloadSelected();
        setError(t("workbenchTasks.conflict"));
        return;
      }
      await reloadSelected();
    } catch {
      setError(t("workbenchTasks.saveFailed"));
    }
  };

  const createField = async (draft: TaskFieldDraft): Promise<void> => {
    if (!api || !snapshot || !draft.name.trim()) return;
    setSavingField(true);
    try {
      const result = await api.createField({
        requestId: taskRequestId(),
        tableId: snapshot.table.id,
        expectedRevision: snapshot.table.revision,
        name: draft.name,
        fieldType: draft.fieldType,
        config: fieldConfigFromDraft(draft),
      });
      if (!result.ok) {
        await reloadSelected();
        setError(t("workbenchTasks.conflict"));
        return;
      }
      setSnapshot({ ...snapshot, table: result.value });
    } catch {
      setError(t("workbenchTasks.saveFailed"));
    } finally {
      setSavingField(false);
    }
  };

  const updateField = async (
    field: WorkbenchTaskField,
    draft: TaskFieldDraft,
  ): Promise<void> => {
    if (!api || !snapshot) return;
    await mutateField(() =>
      api.updateField({
        requestId: taskRequestId(),
        tableId: snapshot.table.id,
        fieldId: field.id,
        expectedRevision: snapshot.table.revision,
        name: draft.name,
        config: fieldConfigFromDraft(draft, field.config),
      }),
    );
  };

  const moveField = async (
    field: WorkbenchTaskField,
    direction: "up" | "down",
  ): Promise<void> => {
    if (!api || !snapshot) return;
    const fields = snapshot.table.fields;
    const index = fields.findIndex(({ id }) => id === field.id);
    const target = fields[index + (direction === "up" ? -1 : 1)];
    if (!target) return;
    const position =
      direction === "up"
        ? Math.max(0, target.position - 1)
        : target.position + 1;
    await mutateField(() =>
      api.updateField({
        requestId: taskRequestId(),
        tableId: snapshot.table.id,
        fieldId: field.id,
        expectedRevision: snapshot.table.revision,
        position,
      }),
    );
  };

  const deleteField = async (): Promise<void> => {
    if (!api || !snapshot || !deleteFieldCandidate) return;
    await mutateField(() =>
      api.deleteField({
        requestId: taskRequestId(),
        tableId: snapshot.table.id,
        fieldId: deleteFieldCandidate.id,
        expectedRevision: snapshot.table.revision,
      }),
    );
    closeDeleteConfirmation(() => setDeleteFieldCandidate(undefined));
  };

  const mutateField = async (
    mutate: () => ReturnType<WorkbenchTaskApi["updateField"]>,
  ): Promise<void> => {
    if (!snapshot) return;
    setSavingField(true);
    setError(undefined);
    try {
      const result = await mutate();
      if (!result.ok) {
        await reloadSelected();
        setError(t("workbenchTasks.conflict"));
        return;
      }
      setSnapshot((current) =>
        current ? { ...current, table: result.value } : current,
      );
    } catch {
      setError(t("workbenchTasks.saveFailed"));
    } finally {
      setSavingField(false);
    }
  };

  const replaceRecord = (record: WorkbenchTaskRecord): void => {
    setSnapshot((current) =>
      current
        ? {
            ...current,
            records: current.records.map((item) =>
              item.id === record.id ? record : item,
            ),
          }
        : current,
    );
  };

  const toggleRecord = (recordId: string): void => {
    setSelectedRecordIds((current) => {
      const next = new Set(current);
      if (next.has(recordId)) next.delete(recordId);
      else next.add(recordId);
      return next;
    });
  };

  const toggleAllVisible = (): void => {
    if (!snapshot) return;
    setSelectedRecordIds((current) => {
      const next = new Set(current);
      const allSelected = snapshot.records.every(({ id }) => next.has(id));
      for (const record of snapshot.records) {
        if (allSelected) next.delete(record.id);
        else next.add(record.id);
      }
      return next;
    });
  };

  const deleteSelectedRecords = async (): Promise<void> => {
    if (!api || !snapshot || selectedRecordIds.size === 0) return;
    setDeletingRecords(true);
    setError(undefined);
    try {
      await api.bulkDeleteRecords({
        requestId: taskRequestId(),
        tableId: snapshot.table.id,
        recordIds: [...selectedRecordIds],
      });
      const [nextSnapshot, nextTables] = await Promise.all([
        api.getTable(snapshot.table.id, { page: snapshot.page }),
        api.listTables(),
      ]);
      setSnapshot(nextSnapshot);
      setTables(nextTables);
      setSelectedRecordIds(new Set());
      setDeleteRecordsOpen(false);
      setTimeout(() => filterButtonRef.current?.focus(), 0);
    } catch {
      setError(t("workbenchTasks.saveFailed"));
    } finally {
      setDeletingRecords(false);
    }
  };

  const saveViewState = async (viewState: TaskViewState): Promise<void> => {
    if (!api) return;
    setSavingView(true);
    setError(undefined);
    const operation = viewSaveQueueRef.current.then(async () => {
      const current = snapshotRef.current;
      if (!current) return;
      try {
        const result = await api.updateTable({
          requestId: taskRequestId(),
          tableId: current.table.id,
          expectedRevision: current.table.revision,
          viewState,
        });
        if (!result.ok) {
          await reloadSelected();
          setError(t("workbenchTasks.conflict"));
          return;
        }
        const next = await api.getTable(current.table.id);
        snapshotRef.current = next;
        syncTableSummary(next);
        setSelectedRecordIds(new Set());
      } catch {
        setError(t("workbenchTasks.saveFailed"));
      }
    });
    viewSaveQueueRef.current = operation.catch(() => undefined);
    await operation.finally(() => {
      setSavingView(false);
    });
  };

  const openDeleteConfirmation = (open: () => void): void => {
    deleteFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : undefined;
    open();
  };

  const closeDeleteConfirmation = (close: () => void): void => {
    close();
    setTimeout(() => {
      const target = deleteFocusRef.current;
      if (target?.isConnected) target.focus();
      else filterButtonRef.current?.focus();
    }, 0);
  };

  const changePage = async (page: number): Promise<void> => {
    await loadPage(page);
    setSelectedRecordIds(new Set());
  };

  return (
    <>
      <WorkbenchSplitPage
        navigation={
          <TaskTableNavigation
            tables={tables}
            selectedTableId={selectedTableId}
            onSelect={setSelectedTableId}
            onRename={renameTable}
            onDuplicate={duplicateTable}
            onDelete={(table) =>
              openDeleteConfirmation(() => setDeleteTableCandidate(table))
            }
            onMove={moveTable}
          />
        }
        createLabel={t("workbenchTasks.createTable")}
        createIconOnly
        onCreate={() => void createTable()}
        floatingActionLabel={t("workbenchTasks.createRecord")}
        onFloatingAction={snapshot ? () => setRecordDrawer("new") : undefined}
      >
        <section className="workbench-task-page" aria-busy={loading}>
          {error ? (
            <InlineAlert
              className="workbench-task-error"
              tone="danger"
              title={error}
            >
              {snapshot ? (
                <span className="workbench-stale-note">
                  {t("workbenchHub.stale")}
                </span>
              ) : null}
            </InlineAlert>
          ) : null}
          {snapshot ? (
            <>
              <TaskWorkbenchToolbar
                selectedCount={selectedRecordIds.size}
                filterCount={snapshot.table.viewState.filters.length}
                groupCount={snapshot.table.viewState.groups.length}
                sortCount={snapshot.table.viewState.sorts.length}
                filterButtonRef={filterButtonRef}
                groupButtonRef={groupButtonRef}
                sortButtonRef={sortButtonRef}
                onDeleteSelected={() =>
                  openDeleteConfirmation(() => setDeleteRecordsOpen(true))
                }
                onOpenFilter={() => setActiveViewPopover("filter")}
                onOpenGroup={() => setActiveViewPopover("group")}
                onOpenSort={() => setActiveViewPopover("sort")}
                onManageFields={() => setFieldDialogOpen(true)}
              />
              <TaskTableGrid
                name={snapshot.table.name}
                fields={snapshot.table.fields}
                records={snapshot.records}
                groupTree={snapshot.groupTree}
                ungroupedLabel={t("workbenchTasks.ungrouped")}
                selectedRecordIds={selectedRecordIds}
                selectAllLabel={t("workbenchTasks.selectAll")}
getSelectRecordLabel={(record) =>
                  t("workbenchTasks.selectRecord", {
                    name: taskRecordDisplayName(record, snapshot.table.fields),
                  })
                }
                getRecordName={(record) =>
                  taskRecordDisplayName(record, snapshot.table.fields)
                }
                getResizeColumnLabel={(field) =>
                  t("workbenchTasks.resizeColumn", { name: field.name })
                }
                onToggleRecord={toggleRecord}
                onToggleAll={toggleAllVisible}
                onUpdateCell={updateCell}
                onMoveRecord={moveRecord}
              />
              <TaskPagination
                total={snapshot.total}
                page={snapshot.page}
                pageSize={snapshot.pageSize}
                onPreviousPage={() => void changePage(snapshot.page - 1)}
                onNextPage={() => void changePage(snapshot.page + 1)}
              />
            </>
          ) : (
            <EmptyState
              className="workbench-task-empty"
              icon={<Plus size={22} />}
              title={
                selectedTable
                  ? t("workbenchTasks.loading")
                  : t("workbenchTasks.empty")
              }
            />
          )}
        </section>
      </WorkbenchSplitPage>
      {snapshot && recordDrawer && api && attachmentsApi ? (
        <TaskRecordDrawer
          key={recordDrawer === "new" ? "new" : recordDrawer.id}
          fields={snapshot.table.fields}
          record={recordDrawer === "new" ? undefined : recordDrawer}
          attachments={attachmentsApi}
          tasks={api}
          saving={savingRecord}
          onClose={() => setRecordDrawer(undefined)}
          onRecordUpdated={(record) => {
            replaceRecord(record);
            setRecordDrawer(record);
          }}
          onSave={saveRecord}
        />
      ) : null}
      {deleteTableCandidate ? (
        <TaskConfirmDialog
          title={t("workbenchTasks.deleteTableTitle")}
          message={t("workbenchTasks.deleteTableMessage", {
            name: deleteTableCandidate.name,
          })}
          onClose={() =>
            closeDeleteConfirmation(() => setDeleteTableCandidate(undefined))
          }
          onConfirm={deleteTable}
        />
      ) : null}
      {fieldDialogOpen ? (
        <TaskFieldManagerDialog
          fields={snapshot?.table.fields ?? []}
          saving={savingField}
          onClose={() => setFieldDialogOpen(false)}
          onCreate={createField}
          onUpdate={updateField}
          onMove={moveField}
          onDelete={(field) =>
            openDeleteConfirmation(() => setDeleteFieldCandidate(field))
          }
        />
      ) : null}
      {deleteFieldCandidate ? (
        <TaskConfirmDialog
          title={t("workbenchTasks.deleteFieldTitle")}
          message={t("workbenchTasks.deleteFieldMessage", {
            name: deleteFieldCandidate.name,
          })}
          onClose={() =>
            closeDeleteConfirmation(() => setDeleteFieldCandidate(undefined))
          }
          onConfirm={deleteField}
        />
      ) : null}
      {deleteRecordsOpen ? (
        <TaskConfirmDialog
          title={t("workbenchTasks.deleteRecordsTitle")}
          message={t("workbenchTasks.deleteRecordsMessage", {
            count: selectedRecordIds.size,
          })}
          confirmDisabled={deletingRecords}
          onClose={() =>
            closeDeleteConfirmation(() => setDeleteRecordsOpen(false))
          }
          onConfirm={deleteSelectedRecords}
        />
      ) : null}
      {snapshot && activeViewPopover ? (
        <TaskViewPopover
          mode={activeViewPopover}
          anchorRef={
            activeViewPopover === "filter"
              ? filterButtonRef
              : activeViewPopover === "group"
                ? groupButtonRef
                : sortButtonRef
          }
          fields={snapshot.table.fields}
          viewState={snapshot.table.viewState}
          saving={savingView}
          onClose={() => setActiveViewPopover(undefined)}
          onSave={saveViewState}
        />
      ) : null}
    </>
  );
}
