import type {
  DragEvent as ReactDragEvent,
  MutableRefObject,
} from "react";
import type {
  WorkspaceNavigation,
  WorkspaceSpace,
} from "../../domain/workspace";
import type { WorkspaceNameDialogState } from "./WorkspaceNameDialog";
import type { SidebarDragState } from "./use-workspace-sidebar-drag";
import type { ViewportMenuPosition } from "./workspace-sidebar-menu-position";

export type SpaceEntryProps = {
  space: WorkspaceSpace;
  index: number;
  count: number;
  requirements: WorkspaceNavigation["requirementsBySpace"][string];
  requirementsOpen: boolean;
  dropTarget: string | null;
  activeMenuPath: string | null;
  activeRequirementMenuKey: string | null;
  menuPosition: ViewportMenuPosition | null;
  requirementMenuPosition: ViewportMenuPosition | null;
  dragRef: MutableRefObject<SidebarDragState | null>;
  onDropTargetChange: (target: string) => void;
  onClearDrag: () => void;
  onSpaceDrop: (event: ReactDragEvent<HTMLElement>, path: string) => void;
  onRequirementDrop: (
    event: ReactDragEvent<HTMLElement>,
    spacePath: string,
    requirementId: string,
  ) => void;
  onMoveSpace: (targetIndex: number) => void;
  onMoveRequirement: (
    requirementId: string,
    targetIndex: number,
  ) => void;
  onToggleRequirements: () => void;
  onOpenSpaceMenu: (bounds: DOMRect) => void;
  onOpenRequirementMenu: (key: string, bounds: DOMRect) => void;
  onOpenNameDialog: (dialog: WorkspaceNameDialogState) => void;
  onCloseSpaceMenu: () => void;
  onCloseRequirementMenu: () => void;
  onRelocateSpace: () => void;
};
