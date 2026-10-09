import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocalization } from "../../localization/LocalizationProvider";
import { IconButton } from "./Button";

export const SIMPLE_LIST_PAGE_SIZE = 100;

export function useListPagination<T>(
  items: readonly T[],
  pageSize = SIMPLE_LIST_PAGE_SIZE,
  controlled?: {
    page: number;
    onPageChange: (page: number) => void;
  },
): {
  page: number;
  pageItems: readonly T[];
  pageSize: number;
  setPage: (page: number) => void;
  resetPage: () => void;
} {
  const [uncontrolledPage, setUncontrolledPage] = useState(1);
  const page = controlled?.page ?? uncontrolledPage;
  const onPageChange = controlled?.onPageChange;
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const validPage = Math.min(page, pageCount);

  useEffect(() => {
    if (page === validPage) return;
    if (onPageChange) onPageChange(validPage);
    else setUncontrolledPage(validPage);
  }, [onPageChange, page, validPage]);

  return useMemo(
    () => ({
      page: validPage,
      pageItems: items.slice(
        (validPage - 1) * pageSize,
        validPage * pageSize,
      ),
      pageSize,
      setPage: (nextPage: number) => {
        const boundedPage = Math.min(pageCount, Math.max(1, nextPage));
        if (onPageChange) onPageChange(boundedPage);
        else setUncontrolledPage(boundedPage);
      },
      resetPage: () => {
        if (onPageChange) onPageChange(1);
        else setUncontrolledPage(1);
      },
    }),
    [items, onPageChange, pageCount, pageSize, validPage],
  );
}

export function ListPagination({
  total,
  page,
  pageSize = SIMPLE_LIST_PAGE_SIZE,
  onPageChange,
  className,
}: {
  total: number;
  page: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  className?: string;
}): JSX.Element | null {
  const { t } = useLocalization();
  if (total <= pageSize) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);

  return (
    <nav
      className={["ui-list-pagination", className].filter(Boolean).join(" ")}
      aria-label={t("common.pagination")}
    >
      <span>{t("common.paginationRange", { start, end, total })}</span>
      <IconButton
        size="compact"
        variant="ghost"
        aria-label={t("common.previousPage")}
        title={t("common.previousPage")}
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        <ChevronLeft size={14} aria-hidden="true" />
      </IconButton>
      <IconButton
        size="compact"
        variant="ghost"
        aria-label={t("common.nextPage")}
        title={t("common.nextPage")}
        disabled={end >= total}
        onClick={() => onPageChange(page + 1)}
      >
        <ChevronRight size={14} aria-hidden="true" />
      </IconButton>
    </nav>
  );
}
