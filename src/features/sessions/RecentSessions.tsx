import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Ellipsis, ListFilter, MessageCircle } from "lucide-react";
import { NavLink } from "react-router-dom";
import type { WorkspaceSpace } from "../../domain/workspace";
import type { ChatSession } from "../../domain/chat-session";
import type {
  RecentConversationFilters,
  RecentConversationKindFilter,
  RecentConversationTimeRange,
} from "./recent-conversation-filters";
import { useLocalization } from "../../localization/LocalizationProvider";
import {
  IconButton,
  ListPagination,
  useListPagination,
} from "../../components/ui";
import { RecentSessionPreview } from "./RecentSessionPreview";
import { ConversationActionsMenu } from "./ConversationActionsMenu";
import { ConversationActionDialog } from "./ConversationActionDialog";

type RecentSessionsProps = {
  sessions: ChatSession[];
  spaces: WorkspaceSpace[];
  folderPaths: string[];
  filters: RecentConversationFilters;
  open: boolean;
  loading: boolean;
  onToggle: () => void;
  onFilterChange: (patch: Partial<RecentConversationFilters>) => void;
  onRename: (sessionId: string, title: string) => Promise<unknown>;
  onDelete: (sessionId: string) => Promise<boolean>;
};

type ActivePreview = {
  anchor: HTMLElement;
  session: ChatSession;
};

const PREVIEW_DELAY_MS = 280;

export function RecentSessions({
  sessions,
  spaces,
  folderPaths,
  filters,
  open,
  loading,
  onToggle,
  onFilterChange,
  onRename,
  onDelete,
}: RecentSessionsProps): JSX.Element {
  const { locale, t } = useLocalization();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [preview, setPreview] = useState<ActivePreview>();
  const [actionMenu, setActionMenu] = useState<{
    anchor: HTMLButtonElement;
    session: ChatSession;
  }>();
  const [dialog, setDialog] = useState<{
    mode: "rename" | "delete";
    session: ChatSession;
  }>();
  const [actionPending, setActionPending] = useState(false);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const spacesByReference = new Map(
    spaces.flatMap((space) => [
      [space.path, space] as const,
      ...(space.id ? [[space.id, space] as const] : []),
    ]),
  );
  const previewSpace = preview
    ? spaceForSession(preview.session, spacesByReference)
    : undefined;
  const recentSessions = sessions.filter(
    (session) => session.kind !== "requirement_node",
  );
  const sessionPagination = useListPagination(recentSessions);
  const activeFilters =
    filters.kind !== "all" ||
    Boolean(filters.workspaceId || filters.folderPath) ||
    filters.timeRange !== "all";
  const contextValue = filters.workspaceId
    ? `workspace:${filters.workspaceId}`
    : filters.folderPath
      ? `folder:${filters.folderPath}`
      : "";
  const clearPreviewTimer = useCallback((): void => {
    if (previewTimerRef.current === undefined) return;
    clearTimeout(previewTimerRef.current);
    previewTimerRef.current = undefined;
  }, []);
  const dismissPreview = useCallback((): void => {
    clearPreviewTimer();
    setPreview(undefined);
  }, [clearPreviewTimer]);
  const showPreview = useCallback(
    (
      session: ChatSession,
      anchor: HTMLElement,
      immediate: boolean,
    ): void => {
      clearPreviewTimer();
      if (immediate) {
        setPreview({ anchor, session });
        return;
      }
      previewTimerRef.current = setTimeout(() => {
        previewTimerRef.current = undefined;
        setPreview({ anchor, session });
      }, PREVIEW_DELAY_MS);
    },
    [clearPreviewTimer],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") dismissPreview();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      clearPreviewTimer();
    };
  }, [clearPreviewTimer, dismissPreview]);

  return (
    <section
      className={open ? "recent-section open" : "recent-section collapsed"}
      aria-label={t("recent.region")}
    >
      <div className="recent-controls">
        <div className="recent-heading">
          <h2>
            <button
              className="recent-toggle"
              type="button"
              aria-expanded={open}
              onClick={onToggle}
            >
              <span>{t("recent.count", { count: recentSessions.length })}</span>
              <ChevronDown
                className={open ? "recent-chevron open" : "recent-chevron"}
                size={14}
              />
            </button>
          </h2>
          <button
            className={
              activeFilters
                ? "recent-filter-button active"
                : "recent-filter-button"
            }
            type="button"
            aria-label={t("recent.filter")}
            aria-expanded={filtersOpen}
            title={t("recent.filter")}
            onClick={() => setFiltersOpen((current) => !current)}
          >
            <ListFilter size={14} strokeWidth={1.8} />
          </button>
        </div>
        {open && filtersOpen ? (
          <div className="recent-filter-panel">
            <label className="recent-filter-row">
              <span>{t("recent.type")}</span>
              <select name="recent-type-aria" autoComplete="off"
                aria-label={t("recent.typeAria")}
                value={filters.kind}
                onChange={(event) =>
                  onFilterChange({
                    kind: event.target.value as RecentConversationKindFilter,
                  })
                }
              >
                <option value="all">{t("recent.type.all")}</option>
                <option value="general">{t("recent.type.general")}</option>
                <option value="space">{t("recent.type.space")}</option>
              </select>
            </label>
            <label className="recent-filter-row">
              <span>{t("recent.context")}</span>
              <select name="recent-context-aria" autoComplete="off"
                aria-label={t("recent.contextAria")}
                value={contextValue}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value.startsWith("workspace:")) {
                    onFilterChange({
                      workspaceId: value.slice("workspace:".length),
                    });
                  } else if (value.startsWith("folder:")) {
                    onFilterChange({
                      folderPath: value.slice("folder:".length),
                    });
                  } else {
                    onFilterChange({ workspaceId: "", folderPath: "" });
                  }
                }}
              >
                <option value="">{t("recent.context.all")}</option>
                {filters.kind !== "general"
                  ? spaces
                      .filter((space) => space.id)
                      .map((space) => (
                        <option
                          key={`workspace:${space.id}`}
                          value={`workspace:${space.id}`}
                        >
                          {space.label}
                        </option>
                      ))
                  : null}
                {filters.kind !== "space"
                  ? folderPaths.map((folderPath) => (
                      <option
                        key={`folder:${folderPath}`}
                        value={`folder:${folderPath}`}
                        title={folderPath}
                      >
                        {folderBasename(folderPath)}
                      </option>
                    ))
                  : null}
              </select>
            </label>
            <label className="recent-filter-row">
              <span>{t("recent.time")}</span>
              <select name="recent-time-aria" autoComplete="off"
                aria-label={t("recent.timeAria")}
                value={filters.timeRange}
                onChange={(event) =>
                  onFilterChange({
                    timeRange: event.target
                      .value as RecentConversationTimeRange,
                  })
                }
              >
                <option value="all">{t("recent.time.all")}</option>
                <option value="day">{t("recent.time.day")}</option>
                <option value="week">{t("recent.time.week")}</option>
                <option value="month">{t("recent.time.month")}</option>
              </select>
            </label>
          </div>
        ) : null}
      </div>
      {open && recentSessions.length > 0 ? (
        <nav className="recent-session-list" aria-label={t("recent.list")}>
          {sessionPagination.pageItems.map((session) => (
            <div
              className={
                actionMenu?.session.id === session.id
                  ? "recent-session menu-open"
                  : "recent-session"
              }
              key={session.id}
            >
              <NavLink
                to={`/sessions/${session.id}`}
                className={({ isActive }) =>
                  isActive
                    ? "recent-session-link active"
                    : "recent-session-link"
                }
                aria-describedby={
                  preview?.session.id === session.id
                    ? `recent-session-preview-${session.id}`
                    : undefined
                }
                onMouseEnter={(event) =>
                  showPreview(session, event.currentTarget, false)
                }
                onMouseLeave={dismissPreview}
                onFocus={(event) =>
                  showPreview(session, event.currentTarget, true)
                }
                onBlur={dismissPreview}
              >
                <span className="recent-session-icon" aria-hidden="true">
                  <MessageCircle size={14} strokeWidth={1.8} />
                </span>
                <span className="recent-session-title">{session.title}</span>
              </NavLink>
              <IconButton
                className="recent-session-actions-trigger"
                size="compact"
                variant="ghost"
                aria-label={t("recent.actions.more", { name: session.title })}
                aria-expanded={actionMenu?.session.id === session.id}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  dismissPreview();
                  const anchor = event.currentTarget;
                  setActionMenu((current) =>
                    current?.session.id === session.id
                      ? undefined
                      : { anchor, session },
                  );
                }}
              >
                <Ellipsis size={16} strokeWidth={1.8} />
              </IconButton>
            </div>
          ))}
        </nav>
      ) : open ? (
        <p className="recent-empty">
          {loading
            ? t("recent.loading")
            : activeFilters
              ? t("recent.noMatch")
              : t("recent.empty")}
        </p>
      ) : null}
      {open ? (
        <ListPagination
          className="recent-session-pagination"
          total={recentSessions.length}
          page={sessionPagination.page}
          pageSize={sessionPagination.pageSize}
          onPageChange={(page) => {
            dismissPreview();
            sessionPagination.setPage(page);
          }}
        />
      ) : null}
      {preview ? (
        <RecentSessionPreview
          anchor={preview.anchor}
          context={sessionContext(
            preview.session,
            spacesByReference,
            t("recent.preview.noContext"),
          )}
          id={`recent-session-preview-${preview.session.id}`}
          title={preview.session.title}
          type={
            preview.session.kind === "space"
              ? previewSpace
                ? t("recent.preview.spaceConversationNamed", {
                    name: previewSpace.label,
                  })
                : t("recent.preview.spaceConversation")
              : preview.session.folderPath
                ? t("recent.preview.localTask")
                : t("recent.preview.generalConversation")
          }
          updatedAt={t("recent.preview.updatedAt", {
            time: formatPreviewTime(
              preview.session.updatedAt,
              Date.now(),
              locale,
              t("chat.today"),
              t("chat.yesterday"),
            ),
          })}
          onDismiss={dismissPreview}
        />
      ) : null}
      {actionMenu ? (
        <ConversationActionsMenu
          anchor={actionMenu.anchor}
          sessionTitle={actionMenu.session.title}
          onRename={() => {
            setDialog({ mode: "rename", session: actionMenu.session });
            setActionMenu(undefined);
          }}
          onDelete={() => {
            setDialog({ mode: "delete", session: actionMenu.session });
            setActionMenu(undefined);
          }}
          onClose={() => setActionMenu(undefined)}
        />
      ) : null}
      {dialog ? (
        <ConversationActionDialog
          session={dialog.session}
          mode={dialog.mode}
          pending={actionPending}
          onClose={() => !actionPending && setDialog(undefined)}
          onRename={(title) => {
            setActionPending(true);
            void onRename(dialog.session.id, title)
              .then((result) => {
                if (result !== undefined && result !== false) {
                  setDialog(undefined);
                }
              })
              .finally(() => setActionPending(false));
          }}
          onDelete={() => {
            setActionPending(true);
            void onDelete(dialog.session.id)
              .then((deleted) => {
                if (deleted) setDialog(undefined);
              })
              .finally(() => setActionPending(false));
          }}
        />
      ) : null}
    </section>
  );
}

function folderBasename(folderPath: string): string {
  const segments = folderPath.split(/[\\/]/).filter(Boolean);
  return segments.at(-1) ?? folderPath;
}

function sessionContext(
  session: ChatSession,
  spacesByReference: Map<string, WorkspaceSpace>,
  fallback: string,
): string {
  if (session.kind === "space") {
    return spaceForSession(session, spacesByReference)?.physicalPath ?? fallback;
  }
  if (session.folderPath) return session.folderPath;
  return fallback;
}

function spaceForSession(
  session: ChatSession,
  spacesByReference: Map<string, WorkspaceSpace>,
): WorkspaceSpace | undefined {
  return (
    (session.workspaceId
      ? spacesByReference.get(session.workspaceId)
      : undefined) ?? spacesByReference.get(session.spacePath)
  );
}

function formatPreviewTime(
  value: number,
  now: number,
  locale: string,
  today: string,
  yesterday: string,
): string {
  const date = new Date(value);
  const current = new Date(now);
  const startOfToday = new Date(
    current.getFullYear(),
    current.getMonth(),
    current.getDate(),
  ).getTime();
  const startOfDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  if (startOfDate === startOfToday) return `${today} ${time}`;
  if (startOfDate === startOfToday - 86_400_000) {
    return `${yesterday} ${time}`;
  }
  return new Intl.DateTimeFormat(locale, {
    ...(date.getFullYear() === current.getFullYear()
      ? {}
      : { year: "numeric" }),
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
