import { ChevronLeft, ChevronRight } from "lucide-react";
import { IconButton } from "../../../components/ui";
import { useLocalization } from "../../../localization/LocalizationProvider";

export function TaskPagination({
  total,
  page,
  pageSize,
  onPreviousPage,
  onNextPage,
}: {
  total: number;
  page: number;
  pageSize: number;
  onPreviousPage: () => void;
  onNextPage: () => void;
}): JSX.Element {
  const { t } = useLocalization();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <footer className="workbench-task-pagination">
      <span>{t("workbenchTasks.recordCount", { count: total })}</span>
      <IconButton
        size="compact"
        variant="ghost"
        aria-label={t("workbenchTasks.previousPage")}
        title={t("workbenchTasks.previousPage")}
        disabled={page <= 1}
        onClick={onPreviousPage}
      >
        <ChevronLeft size={14} aria-hidden="true" />
      </IconButton>
      <span>{t("workbenchTasks.pageStatus", { page, pages })}</span>
      <IconButton
        size="compact"
        variant="ghost"
        aria-label={t("workbenchTasks.nextPage")}
        title={t("workbenchTasks.nextPage")}
        disabled={page * pageSize >= total}
        onClick={onNextPage}
      >
        <ChevronRight size={14} aria-hidden="true" />
      </IconButton>
    </footer>
  );
}
