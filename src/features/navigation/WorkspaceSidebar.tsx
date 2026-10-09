import { type FormEvent, useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  ChevronDown,
  Ellipsis,
  FileText,
  FolderClosed,
  FolderDot,
  FolderOpen,
  FolderOpenDot,
  FolderPlus,
} from "lucide-react";
import type { BusinessApi } from "../../../shared/business";
import { Menu, MenuContent, MenuItem } from "../../components/ui";
import type { ChatSession } from "../../domain/chat-session";
import type { WorkspaceNavigation } from "../../domain/workspace";
import { useLocalization } from "../../localization/LocalizationProvider";
import { RecentSessions } from "../sessions/RecentSessions";
import { beginNativeDrag } from "../drag/native-drag-feedback";
import { DragHandle } from "../drag/DragHandle";
import type { RecentConversationFilters } from "../sessions/recent-conversation-filters";
import {
  WorkspaceNameDialog,
  type WorkspaceNameDialogState,
} from "./WorkspaceNameDialog";
import { RequirementActionsMenu } from "./RequirementActionsMenu";
import { RequirementCreateDialog } from "./RequirementCreateDialog";
import { SpaceActionsMenu } from "./SpaceActionsMenu";
import { WorkspacePrimaryNavigation } from "./WorkspacePrimaryNavigation";
import { WorkspaceUserMenu } from "./WorkspaceUserMenu";
import { useWorkspaceSidebarDrag } from "./use-workspace-sidebar-drag";
import { getViewportMenuPosition, type ViewportMenuPosition }
  from "./workspace-sidebar-menu-position";
import { dropTargetIndex } from "./workspace-sidebar-reorder";
import type { SpaceEntryProps } from "./workspace-space-entry-types";

const SPACE_ITEM_MENU_HEIGHT = 161, REQUIREMENT_MENU_HEIGHT = 86;

export type WorkspaceSidebarProps = WorkspaceNavigation & {
  visible: boolean;
  recentSessions: ChatSession[];
  recentFolderPaths: string[];
  recentFilters: RecentConversationFilters;
  recentSessionsLoading: boolean;
  business?: BusinessApi;
  onRecentFilterChange: (patch: Partial<RecentConversationFilters>) => void;
  onRenameConversation: (
    sessionId: string,
    title: string,
  ) => Promise<unknown>;
  onDeleteConversation: (sessionId: string) => Promise<boolean>;
  onCreateSpace: (label: string) => void;
  onRenameSpace: (spacePath: string, label: string) => void;
  onRelocateSpace: (spacePath: string) => void;
  onDeleteSpace: (spacePath: string) => void;
  onMoveSpace: (sourcePath: string, targetIndex: number) => void;
  onCreateRequirement: (
    spacePath: string,
    title: string,
    templateVersionId?: string,
  ) => void | Promise<void>;
  onRenameRequirement: (
    spacePath: string,
    requirementId: string,
    title: string,
  ) => void;
  onDeleteRequirement: (spacePath: string, requirementId: string) => void;
  onMoveRequirement: (
    spacePath: string,
    sourceId: string,
    targetIndex: number,
  ) => void;
};

export function WorkspaceSidebar({
  visible,
  spaces,
  requirementsBySpace,
  recentSessions,
  recentFolderPaths,
  recentFilters,
  recentSessionsLoading,
  business,
  onRecentFilterChange,
  onRenameConversation,
  onDeleteConversation,
  onCreateSpace,
  onRenameSpace,
  onRelocateSpace,
  onDeleteSpace,
  onMoveSpace,
  onCreateRequirement,
  onRenameRequirement,
  onDeleteRequirement,
  onMoveRequirement,
}: WorkspaceSidebarProps): JSX.Element {
  const { t } = useLocalization();
  const [spacesOpen, setSpacesOpen] = useState(true);
  const [recentOpen, setRecentOpen] = useState(true);
  const [spaceMenuOpen, setSpaceMenuOpen] = useState(false);
  const [spaceItemMenuPath, setSpaceItemMenuPath] = useState<string | null>(
    null,
  );
  const [spaceItemMenuPosition, setSpaceItemMenuPosition] =
    useState<ViewportMenuPosition | null>(null);
  const [requirementMenuKey, setRequirementMenuKey] = useState<string | null>(
    null,
  );
  const [requirementMenuPosition, setRequirementMenuPosition] =
    useState<ViewportMenuPosition | null>(null);
  const [collapsedSpacePaths, setCollapsedSpacePaths] = useState<Set<string>>(
    () => new Set(),
  );
  const [nameDialog, setNameDialog] = useState<WorkspaceNameDialogState | null>(
    null,
  );
  const [nameDraft, setNameDraft] = useState("");
  const spaceActionsRef = useRef<HTMLDivElement>(null);
  const spaceListRef = useRef<HTMLDivElement>(null);
  const {
    dragRef: sidebarDragRef,
    dropTarget: sidebarDropTarget,
    setDropTarget: setSidebarDropTarget,
    clearDrag: clearSidebarDrag,
    handleSpaceDrop,
    handleRequirementDrop,
  } = useWorkspaceSidebarDrag(
    (sourcePath, targetPath) => {
      const targetIndex = dropTargetIndex(
        spaces,
        sourcePath,
        targetPath,
        (space) => space.path,
      );
      if (targetIndex >= 0) onMoveSpace(sourcePath, targetIndex);
    },
    (spacePath, sourceId, targetId) => {
      const requirements = requirementsBySpace[spacePath] ?? [];
      const targetIndex = dropTargetIndex(
        requirements,
        sourceId,
        targetId,
        (requirement) => requirement.id,
      );
      if (targetIndex >= 0) {
        onMoveRequirement(spacePath, sourceId, targetIndex);
      }
    },
  );

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent): void => {
      if (!spaceActionsRef.current?.contains(event.target as Node)) {
        setSpaceMenuOpen(false);
      }
      if (!spaceListRef.current?.contains(event.target as Node)) {
        setSpaceItemMenuPath(null);
        setRequirementMenuKey(null);
        setRequirementMenuPosition(null);
      }
    };
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      setSpaceMenuOpen(false);
      setSpaceItemMenuPath(null);
      setRequirementMenuKey(null);
      setRequirementMenuPosition(null);
      closeNameDialog();
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const openNameDialog = (dialog: WorkspaceNameDialogState): void => {
    setSpaceMenuOpen(false);
    setSpaceItemMenuPath(null);
    setRequirementMenuKey(null);
    setRequirementMenuPosition(null);
    setNameDraft("");
    setNameDialog(dialog);
  };

  const closeNameDialog = (): void => {
    setNameDialog(null);
    setNameDraft("");
  };

  const submitNameDialog = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!nameDialog) return;

    if (nameDialog.kind === "delete-space") {
      if (nameDraft !== nameDialog.spaceLabel) return;
      onDeleteSpace(nameDialog.spacePath);
      setCollapsedSpacePaths((current) => {
        const next = new Set(current);
        next.delete(nameDialog.spacePath);
        return next;
      });
      closeNameDialog();
      return;
    }

    if (nameDialog.kind === "delete-requirement") {
      if (nameDraft !== nameDialog.requirementTitle) return;
      onDeleteRequirement(nameDialog.spacePath, nameDialog.requirementId);
      closeNameDialog();
      return;
    }

    const name = nameDraft.trim();
    if (!name) return;

    if (nameDialog.kind === "rename-space") {
      if (name === nameDialog.spaceLabel) return;
      onRenameSpace(nameDialog.spacePath, name);
      closeNameDialog();
      return;
    }

    if (nameDialog.kind === "rename-requirement") {
      if (name === nameDialog.requirementTitle) return;
      onRenameRequirement(nameDialog.spacePath, nameDialog.requirementId, name);
      closeNameDialog();
      return;
    }

    if (nameDialog.kind === "space") {
      onCreateSpace(name);
    } else {
      onCreateRequirement(nameDialog.spacePath, name);
      setCollapsedSpacePaths((current) => {
        if (!current.has(nameDialog.spacePath)) return current;
        const next = new Set(current);
        next.delete(nameDialog.spacePath);
        return next;
      });
    }
    closeNameDialog();
  };

  return (
    <>
      {visible && (
        <aside className="sidebar">
          <div className="drag-region" />
          <div className="brand">
            <strong>RealmFlow</strong>
          </div>

<WorkspacePrimaryNavigation />

          <div
            className={[
              "sidebar-collections",
              spacesOpen ? "spaces-open" : "spaces-closed",
              recentOpen ? "recent-open" : "recent-closed",
            ].join(" ")}
          >
            <section
              className="spaces-section"
              aria-label={t("workspace.spaces")}
            >
              <div className="spaces-heading">
                <button
                  className="spaces-toggle"
                  type="button"
                  aria-expanded={spacesOpen}
                  onClick={() => {
                    setSpacesOpen((open) => !open);
                    setSpaceItemMenuPath(null);
                    setRequirementMenuKey(null);
                  }}
                >
                  <span>
                    {t("workspace.spacesCount", { count: spaces.length })}
                  </span>
                  <ChevronDown
                    className={
                      spacesOpen ? "spaces-chevron open" : "spaces-chevron"
                    }
                    size={14}
                  />
                </button>
                <div className="space-actions" ref={spaceActionsRef}>
                  <button
                    className="space-actions-trigger"
                    type="button"
                    aria-label={t("workspace.actions")}
                    aria-haspopup="menu"
                    aria-expanded={spaceMenuOpen}
                    title={t("workspace.actions")}
                    onClick={() => {
                      setSpaceMenuOpen((open) => !open);
                      setSpaceItemMenuPath(null);
                      setRequirementMenuKey(null);
                    }}
                  >
                    <Ellipsis size={17} />
                  </button>
                  {spaceMenuOpen && (
                    <Menu
                      open
                      onOpenChange={setSpaceMenuOpen}
                    >
                      <MenuContent
                        className="space-actions-menu"
                        aria-label={t("workspace.actions")}
                      >
                        <MenuItem
                          onSelect={() => openNameDialog({ kind: "space" })}
                        >
                          <FolderPlus size={16} />
                          <span>{t("workspace.create")}</span>
                        </MenuItem>
                      </MenuContent>
                    </Menu>
                  )}
                </div>
              </div>
              {spacesOpen && (
                <div className="space-list" ref={spaceListRef}>
                  {spaces.map((space, index) => (
                    <SpaceEntry
                      key={space.path}
                      space={space}
                      index={index}
                      count={spaces.length}
                      requirements={requirementsBySpace[space.path] ?? []}
                      requirementsOpen={!collapsedSpacePaths.has(space.path)}
                      dropTarget={sidebarDropTarget}
                      activeMenuPath={spaceItemMenuPath}
                      activeRequirementMenuKey={requirementMenuKey}
                      menuPosition={spaceItemMenuPosition}
                      requirementMenuPosition={requirementMenuPosition}
                      dragRef={sidebarDragRef}
                      onDropTargetChange={setSidebarDropTarget}
                      onClearDrag={clearSidebarDrag}
                      onSpaceDrop={handleSpaceDrop}
                      onRequirementDrop={handleRequirementDrop}
                      onMoveSpace={(targetIndex) =>
                        onMoveSpace(space.path, targetIndex)
                      }
                      onMoveRequirement={(requirementId, targetIndex) =>
                        onMoveRequirement(
                          space.path,
                          requirementId,
                          targetIndex,
                        )
                      }
                      onToggleRequirements={() => {
                        setCollapsedSpacePaths((current) => {
                          const next = new Set(current);
                          if (next.has(space.path)) next.delete(space.path);
                          else next.add(space.path);
                          return next;
                        });
                      }}
                      onOpenSpaceMenu={(bounds) => {
                        setSpaceMenuOpen(false);
                        setRequirementMenuKey(null);
                        setRequirementMenuPosition(null);
                        setSpaceItemMenuPosition(
                          getViewportMenuPosition(
                            bounds,
                            SPACE_ITEM_MENU_HEIGHT,
                          ),
                        );
                        setSpaceItemMenuPath((current) =>
                          current === space.path ? null : space.path,
                        );
                      }}
                      onOpenRequirementMenu={(key, bounds) => {
                        if (requirementMenuKey === key) {
                          setRequirementMenuKey(null);
                          setRequirementMenuPosition(null);
                          return;
                        }
                        setSpaceItemMenuPath(null);
                        setSpaceItemMenuPosition(null);
                        setRequirementMenuPosition(
                          getViewportMenuPosition(
                            bounds,
                            REQUIREMENT_MENU_HEIGHT,
                          ),
                        );
                        setRequirementMenuKey(key);
                      }}
                      onOpenNameDialog={openNameDialog}
                      onCloseSpaceMenu={() => {
                        setSpaceItemMenuPath(null);
                        setSpaceItemMenuPosition(null);
                      }}
                      onCloseRequirementMenu={() => {
                        setRequirementMenuKey(null);
                        setRequirementMenuPosition(null);
                      }}
                      onRelocateSpace={() => {
                        setSpaceItemMenuPath(null);
                        onRelocateSpace(space.path);
                      }}
                    />
                  ))}
                </div>
              )}
            </section>
            <RecentSessions
              sessions={recentSessions}
              spaces={spaces}
              folderPaths={recentFolderPaths}
              filters={recentFilters}
              open={recentOpen}
              loading={recentSessionsLoading}
              onToggle={() => setRecentOpen((open) => !open)}
              onFilterChange={onRecentFilterChange}
              onRename={onRenameConversation}
              onDelete={onDeleteConversation}
            />
          </div>

          <WorkspaceUserMenu />
        </aside>
      )}
      {nameDialog?.kind === "requirement" && business ? (
        <RequirementCreateDialog
          business={business}
          spaceLabel={nameDialog.spaceLabel}
          onClose={closeNameDialog}
          onCreate={(title, templateVersionId) => {
            const spacePath = nameDialog.spacePath;
            const result = onCreateRequirement(
              spacePath,
              title,
              templateVersionId,
            );
            setCollapsedSpacePaths((current) => {
              if (!current.has(spacePath)) return current;
              const next = new Set(current);
              next.delete(spacePath);
              return next;
            });
            return result;
          }}
        />
      ) : nameDialog ? (
        <WorkspaceNameDialog
          dialog={nameDialog}
          draft={nameDraft}
          onDraftChange={setNameDraft}
          onClose={closeNameDialog}
          onSubmit={submitNameDialog}
        />
      ) : null}
    </>
  );
}

function SpaceEntry({
  space,
  index,
  count,
  requirements,
  requirementsOpen,
  dropTarget,
  activeMenuPath,
  activeRequirementMenuKey,
  menuPosition,
  requirementMenuPosition,
  dragRef,
  onDropTargetChange,
  onClearDrag,
  onSpaceDrop,
  onRequirementDrop,
  onMoveSpace,
  onMoveRequirement,
  onToggleRequirements,
  onOpenSpaceMenu,
  onOpenRequirementMenu,
  onOpenNameDialog,
  onCloseSpaceMenu,
  onCloseRequirementMenu,
  onRelocateSpace,
}: SpaceEntryProps): JSX.Element {
  const { t } = useLocalization();
  const SpaceStateIcon =
    requirements.length > 0
      ? requirementsOpen
        ? FolderOpenDot
        : FolderDot
      : requirementsOpen
        ? FolderOpen
        : FolderClosed;

  return (
    <div
      className={
        dropTarget === `space:${space.path}`
          ? "space-entry drag-over"
          : "space-entry"
      }
      data-drop-target={
        dropTarget === `space:${space.path}` ? "before" : undefined
      }
      draggable
      onDragStart={(event) => {
        beginNativeDrag(event, event.currentTarget);
        dragRef.current = { kind: "space", spacePath: space.path };
      }}
      onDragEnd={onClearDrag}
      onDragOver={(event) => {
        const activeDrag = dragRef.current;
        if (
          activeDrag?.kind !== "space" ||
          activeDrag.spacePath === space.path
        ) {
          return;
        }
        event.preventDefault();
        onDropTargetChange(`space:${space.path}`);
      }}
      onDrop={(event) => onSpaceDrop(event, space.path)}
    >
      <div className="space-row">
        <NavLink
          to={space.path}
          end
          className={({ isActive }) =>
            isActive ? "space-item active" : "space-item"
          }
        >
          <span className="space-icon" aria-hidden="true">
            <SpaceStateIcon size={18} strokeWidth={1.8} />
          </span>
          <span title={space.label}>{space.label}</span>
        </NavLink>
        <div className="space-row-actions">
          <DragHandle
            className="space-drag-handle"
            name={space.label}
            draggable
          />
          <button
            className="space-requirements-toggle"
            type="button"
            aria-label={t("workspace.requirementsToggle", {
              action: requirementsOpen
                ? t("workspace.collapse")
                : t("workspace.expand"),
              name: space.label,
            })}
            title={t(requirementsOpen ? "workspace.collapse" : "workspace.expand")}
            aria-expanded={requirementsOpen}
            onClick={onToggleRequirements}
          >
            <ChevronDown
              className={
                requirementsOpen
                  ? "space-requirements-chevron open"
                  : "space-requirements-chevron"
              }
              size={14}
            />
          </button>
          <div className="space-item-actions">
            <button
              className="space-item-actions-trigger"
              type="button"
              aria-label={t("workspace.itemActions", { name: space.label })}
              aria-haspopup="menu"
              aria-expanded={activeMenuPath === space.path}
              title={t("tooltip.moreActions")}
              onClick={(event) =>
                onOpenSpaceMenu(event.currentTarget.getBoundingClientRect())
              }
            >
              <Ellipsis size={17} />
            </button>
            {activeMenuPath === space.path && (
              <SpaceActionsMenu
                space={space}
                position={menuPosition}
                onOpenNameDialog={onOpenNameDialog}
                onRelocate={onRelocateSpace}
                onClose={onCloseSpaceMenu}
              />
            )}
          </div>
        </div>
      </div>
      {requirements.length > 0 && requirementsOpen && (
        <ul
          className="space-requirements"
          aria-label={t("workspace.requirementsList", { name: space.label })}
        >
          {requirements.map((requirement, requirementIndex) => {
            const menuKey = `${space.path}:${requirement.id}`;
            return (
              <li
                className={
                  dropTarget === `requirement:${space.path}:${requirement.id}`
                    ? "drag-over"
                    : undefined
                }
                data-drop-target={
                  dropTarget ===
                  `requirement:${space.path}:${requirement.id}`
                    ? "before"
                    : undefined
                }
                draggable
                key={requirement.id}
                onDragStart={(event) => {
                  event.stopPropagation();
                  beginNativeDrag(event, event.currentTarget);
                  dragRef.current = {
                    kind: "requirement",
                    spacePath: space.path,
                    requirementId: requirement.id,
                  };
                }}
                onDragEnd={onClearDrag}
                onDragOver={(event) => {
                  const activeDrag = dragRef.current;
                  if (
                    activeDrag?.kind !== "requirement" ||
                    activeDrag.spacePath !== space.path ||
                    activeDrag.requirementId === requirement.id
                  ) {
                    return;
                  }
                  event.preventDefault();
                  onDropTargetChange(
                    `requirement:${space.path}:${requirement.id}`,
                  );
                }}
                onDrop={(event) =>
                  onRequirementDrop(event, space.path, requirement.id)
                }
              >
                <NavLink
                  to={`${space.path}/requirements/${requirement.id}`}
                  title={requirement.title}
                >
                  <FileText size={15} strokeWidth={1.8} />
                  <span>{requirement.title}</span>
                </NavLink>
                <div className="requirement-row-actions">
                  <DragHandle
                    className="requirement-drag-handle"
                    name={requirement.title}
                    draggable
                  />
                  <div className="requirement-actions">
                    <button
                      className="requirement-actions-trigger"
                      type="button"
                      aria-label={t("requirement.itemActions", {
                        name: requirement.title,
                      })}
                      aria-haspopup="menu"
                      aria-expanded={activeRequirementMenuKey === menuKey}
                      title={t("tooltip.moreActions")}
                      onClick={(event) =>
                        onOpenRequirementMenu(
                          menuKey,
                          event.currentTarget.getBoundingClientRect(),
                        )
                      }
                    >
                      <Ellipsis size={16} />
                    </button>
                    {activeRequirementMenuKey === menuKey && (
                      <RequirementActionsMenu
                        spacePath={space.path}
                        requirementId={requirement.id}
                        requirementTitle={requirement.title}
                        position={requirementMenuPosition ?? undefined}
                        onOpenNameDialog={onOpenNameDialog}
                        onClose={onCloseRequirementMenu}
                      />
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
