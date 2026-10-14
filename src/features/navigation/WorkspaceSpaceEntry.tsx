import { NavLink } from "react-router-dom";
import {
  ChevronDown,
  Ellipsis,
  FileText,
  FolderClosed,
  FolderDot,
  FolderOpen,
  FolderOpenDot,
} from "lucide-react";
import { useLocalization } from "../../localization/LocalizationProvider";
import { beginNativeDrag } from "../drag/native-drag-feedback";
import { RequirementActionsMenu } from "./RequirementActionsMenu";
import { SpaceActionsMenu } from "./SpaceActionsMenu";
import type { SpaceEntryProps } from "./workspace-space-entry-types";

export function SpaceEntry({
  space,
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
      <div
        className="space-row"
        onMouseLeave={(event) => {
          const activeElement = document.activeElement;
          if (
            activeElement instanceof HTMLElement &&
            event.currentTarget.contains(activeElement) &&
            activeElement.classList.contains("space-requirements-toggle")
          ) {
            activeElement.blur();
          }
        }}
      >
        <div className="space-leading-control">
          <span className="space-icon" aria-hidden="true">
            <SpaceStateIcon size={18} strokeWidth={1.8} />
          </span>
          <button
            className="space-requirements-toggle"
            type="button"
            aria-label={t("workspace.requirementsToggle", {
              action: requirementsOpen
                ? t("workspace.collapse")
                : t("workspace.expand"),
              name: space.label,
            })}
            title={t(
              requirementsOpen ? "workspace.collapse" : "workspace.expand",
            )}
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
        </div>
        <NavLink
          to={space.path}
          end
          className={({ isActive }) =>
            isActive ? "space-item active" : "space-item"
          }
          draggable
          onDragStart={(event) => {
            beginNativeDrag(
              event,
              event.currentTarget.closest(".space-entry")!,
            );
            dragRef.current = { kind: "space", spacePath: space.path };
          }}
          onDragEnd={onClearDrag}
        >
          <span title={space.label}>{space.label}</span>
        </NavLink>
        <div className="space-row-actions">
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
          {requirements.map((requirement) => {
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
                key={requirement.id}
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
                  draggable
                  onDragStart={(event) => {
                    event.stopPropagation();
                    beginNativeDrag(
                      event,
                      event.currentTarget.closest("li")!,
                    );
                    dragRef.current = {
                      kind: "requirement",
                      spacePath: space.path,
                      requirementId: requirement.id,
                    };
                  }}
                  onDragEnd={onClearDrag}
                >
                  <FileText size={15} strokeWidth={1.8} />
                  <span>{requirement.title}</span>
                </NavLink>
                <div className="requirement-row-actions">
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
