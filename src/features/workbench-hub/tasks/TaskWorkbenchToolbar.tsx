import { ArrowUpDown, Filter, Group, Settings2, Trash2 } from "lucide-react";
import type { Ref } from "react";
import { Button, IconButton, Toolbar } from "../../../components/ui";
import { useLocalization } from "../../../localization/LocalizationProvider";

export function TaskWorkbenchToolbar({
  selectedCount,
  filterCount,
  groupCount,
  sortCount,
  filterButtonRef,
  groupButtonRef,
  sortButtonRef,
  onDeleteSelected,
  onOpenFilter,
  onOpenGroup,
  onOpenSort,
  onManageFields,
}: {
  selectedCount: number;
  filterCount: number;
  groupCount: number;
  sortCount: number;
  filterButtonRef: Ref<HTMLButtonElement>;
  groupButtonRef: Ref<HTMLButtonElement>;
  sortButtonRef: Ref<HTMLButtonElement>;
  onDeleteSelected: () => void;
  onOpenFilter: () => void;
  onOpenGroup: () => void;
  onOpenSort: () => void;
  onManageFields: () => void;
}): JSX.Element {
  const { t } = useLocalization();

  return (
    <Toolbar
      className="workbench-task-toolbar"
      aria-label={t("workbenchTasks.viewSettings")}
    >
      <div className="workbench-task-toolbar-primary">
        <Button
          ref={filterButtonRef}
          size="compact"
          variant={filterCount > 0 ? "neutral" : "ghost"}
          leadingIcon={<Filter size={14} aria-hidden="true" />}
          aria-pressed={filterCount > 0}
          onClick={onOpenFilter}
        >
          {filterCount > 0
            ? t("workbenchTasks.filterCount", { count: filterCount })
            : t("workbenchTasks.filter")}
        </Button>
        <Button
          ref={groupButtonRef}
          size="compact"
          variant={groupCount > 0 ? "neutral" : "ghost"}
          leadingIcon={<Group size={14} aria-hidden="true" />}
          aria-pressed={groupCount > 0}
          onClick={onOpenGroup}
        >
          {groupCount > 0
            ? t("workbenchTasks.groupCount", { count: groupCount })
            : t("workbenchTasks.group")}
        </Button>
        <Button
          ref={sortButtonRef}
          size="compact"
          variant={sortCount > 0 ? "neutral" : "ghost"}
          leadingIcon={<ArrowUpDown size={14} aria-hidden="true" />}
          aria-pressed={sortCount > 0}
          onClick={onOpenSort}
        >
          {sortCount > 0
            ? t("workbenchTasks.sortCount", { count: sortCount })
            : t("workbenchTasks.sort")}
        </Button>
        {selectedCount > 0 ? (
          <Button
            size="compact"
            variant="danger"
            leadingIcon={<Trash2 size={14} aria-hidden="true" />}
            onClick={onDeleteSelected}
          >
            {t("workbenchTasks.deleteSelected", { count: selectedCount })}
          </Button>
        ) : null}
      </div>
      <div className="workbench-task-toolbar-secondary">
        <IconButton
          size="compact"
          variant="ghost"
          aria-label={t("workbenchTasks.addField")}
          title={t("workbenchTasks.addField")}
          onClick={onManageFields}
        >
          <Settings2 size={15} aria-hidden="true" />
        </IconButton>
      </div>
    </Toolbar>
  );
}
