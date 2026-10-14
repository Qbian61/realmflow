import { type FormEvent, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Ellipsis,
  FolderPlus,
} from "lucide-react";
import type { BusinessApi } from "../../../shared/business";
import { Menu, MenuContent, MenuItem } from "../../components/ui";
import type { ChatSession } from "../../domain/chat-session";
import type { WorkspaceNavigation } from "../../domain/workspace";
import { useLocalization } from "../../localization/LocalizationProvider";
import { RecentSessions } from "../sessions/RecentSessions";
import type { RecentConversationFilters } from "../sessions/recent-conversation-filters";
import {
  WorkspaceNameDialog,
  type WorkspaceNameDialogState,
} from "./WorkspaceNameDialog";
import { RequirementActionsMenu } from "./RequirementActionsMenu";
import { RequirementCreateDialog } from "./RequirementCreateDialog";
import { SpaceActionsMenu } from "./SpaceActionsMenu";
import { WorkspacePrimaryNavigation } from "./WorkspacePrimaryNavigation";
import { SpaceEntry } from "./WorkspaceSpaceEntry";
import { WorkspaceUserMenu } from "./WorkspaceUserMenu";
import { useWorkspaceSidebarDrag } from "./use-workspace-sidebar-drag";
import { getViewportMenuPosition, type ViewportMenuPosition }
  from "./workspace-sidebar-menu-position";
import { dropTargetIndex } from "./workspace-sidebar-reorder";

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
      const target = event.target;
      const insideFloatingSpaceMenu =
        target instanceof Element &&
        Boolean(
          target.closest(
            ".space-item-actions-menu, .requirement-actions-menu",
          ),
        );
      if (
        !spaceListRef.current?.contains(target as Node) &&
        !insideFloatingSpaceMenu
      ) {
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
