import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  DuplicateTaskTableMode,
  WorkbenchTaskApi,
  WorkbenchTaskTableSnapshot,
  WorkbenchTaskTableSummary,
} from "../../../../shared/workbench-tasks";
import { useLocalization } from "../../../localization/LocalizationProvider";
import { taskRequestId } from "./task-ui-utils";

function normalizeTaskSnapshot(
  snapshot: WorkbenchTaskTableSnapshot,
): WorkbenchTaskTableSnapshot {
  const viewState = snapshot.table.viewState;
  return {
    ...snapshot,
    table: {
      ...snapshot.table,
      viewState: {
        filters: viewState?.filters ?? [],
        filterJoin: "and",
        groups: viewState?.groups ?? [],
        sorts: viewState?.sorts ?? [],
      },
    },
    groupTree: snapshot.groupTree ?? [],
  };
}

export function useTaskTableManagement(api?: WorkbenchTaskApi) {
  const { t } = useLocalization();
  const [tables, setTables] = useState<WorkbenchTaskTableSummary[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<string>();
  const [snapshot, setSnapshotState] = useState<WorkbenchTaskTableSnapshot>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const setSnapshot: Dispatch<
    SetStateAction<WorkbenchTaskTableSnapshot | undefined>
  > = (next) => {
    setSnapshotState((current) => {
      const resolved = typeof next === "function" ? next(current) : next;
      return resolved ? normalizeTaskSnapshot(resolved) : undefined;
    });
  };

  useEffect(() => {
    if (!api) {
      setLoading(false);
      return;
    }
    let active = true;
    void api
      .listTables()
      .then((items) => {
        if (!active) return;
        setTables(items);
        setSelectedTableId((current) => current ?? items[0]?.id);
      })
      .catch(() => active && setError(t("workbenchTasks.loadFailed")))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [api, t]);

  useEffect(() => {
    if (!api || !selectedTableId) {
      setSnapshot(undefined);
      return;
    }
    let active = true;
    setLoading(true);
    void api
      .getTable(selectedTableId)
      .then((next) => {
        if (active) setSnapshot(next);
      })
      .catch(() => active && setError(t("workbenchTasks.loadFailed")))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [api, selectedTableId, t]);

  const selectedTable = useMemo(
    () => tables.find(({ id }) => id === selectedTableId),
    [selectedTableId, tables],
  );

  const syncTableSummary = (next: WorkbenchTaskTableSnapshot): void => {
    setSnapshot(next);
    setTables((current) =>
      current.map((table) =>
        table.id === next.table.id
          ? { ...next.table, recordCount: next.total }
          : table,
      ),
    );
  };

  const createTable = async (): Promise<void> => {
    if (!api) return;
    setError(undefined);
    try {
      const created = await api.createTable({
        requestId: taskRequestId(),
        name: t("workbenchTasks.unnamedTable"),
      });
      setTables((current) => [...current, created.table]);
      setSelectedTableId(created.table.id);
      setSnapshot(created);
    } catch {
      setError(t("workbenchTasks.saveFailed"));
    }
  };

  const renameTable = async (
    table: WorkbenchTaskTableSummary,
    name: string,
  ): Promise<boolean> => {
    if (!api) return false;
    setError(undefined);
    try {
      const result = await api.updateTable({
        requestId: taskRequestId(),
        tableId: table.id,
        expectedRevision: table.revision,
        name,
      });
      if (!result.ok) {
        setTables(await api.listTables());
        setError(t("workbenchTasks.conflict"));
        return false;
      }
      setTables((current) =>
        current.map((item) =>
          item.id === table.id ? { ...item, ...result.value } : item,
        ),
      );
      setSnapshot((current) =>
        current?.table.id === table.id
          ? { ...current, table: result.value }
          : current,
      );
      return true;
    } catch {
      setError(t("workbenchTasks.saveFailed"));
      return false;
    }
  };

  const duplicateTable = async (
    table: WorkbenchTaskTableSummary,
    mode: DuplicateTaskTableMode,
  ): Promise<void> => {
    if (!api) return;
    setError(undefined);
    try {
      const copy = await api.duplicateTable({
        requestId: taskRequestId(),
        tableId: table.id,
        name: `${table.name} ${t("workbenchTasks.copySuffix")}`,
        mode,
      });
      setTables(await api.listTables());
      setSelectedTableId(copy.table.id);
      setSnapshot(copy);
    } catch {
      setError(t("workbenchTasks.saveFailed"));
    }
  };

  const moveTable = async (
    table: WorkbenchTaskTableSummary,
    position: number,
  ): Promise<void> => {
    if (!api) return;
    setError(undefined);
    try {
      const result = await api.updateTable({
        requestId: taskRequestId(),
        tableId: table.id,
        expectedRevision: table.revision,
        position,
      });
      setTables(await api.listTables());
      if (!result.ok) {
        setError(t("workbenchTasks.conflict"));
      } else {
        setSnapshot((current) =>
          current?.table.id === table.id
            ? { ...current, table: result.value }
            : current,
        );
      }
    } catch {
      setError(t("workbenchTasks.saveFailed"));
      setTables(await api.listTables().catch(() => tables));
    }
  };

  const deleteTable = async (
    table: WorkbenchTaskTableSummary,
  ): Promise<boolean> => {
    if (!api) return false;
    setError(undefined);
    try {
      const result = await api.deleteTable({
        requestId: taskRequestId(),
        tableId: table.id,
        expectedRevision: table.revision,
      });
      if (!result.ok) {
        setTables(await api.listTables());
        setError(t("workbenchTasks.conflict"));
        return false;
      }
      const nextTables = await api.listTables();
      setTables(nextTables);
      if (selectedTableId === table.id) {
        setSnapshot(undefined);
        setSelectedTableId(nextTables[0]?.id);
      }
      return true;
    } catch {
      setError(t("workbenchTasks.saveFailed"));
      return false;
    }
  };

  const reloadSelected = async (): Promise<void> => {
    if (!api || !selectedTableId) return;
    syncTableSummary(await api.getTable(selectedTableId));
  };

  const loadPage = async (page: number): Promise<void> => {
    if (!api || !snapshot || page < 1) return;
    setLoading(true);
    setError(undefined);
    try {
      setSnapshot(await api.getTable(snapshot.table.id, { page }));
    } catch {
      setError(t("workbenchTasks.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  return {
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
    deleteTable,
    loadPage,
  };
}
