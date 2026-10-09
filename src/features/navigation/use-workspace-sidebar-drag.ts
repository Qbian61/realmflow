import {
  type DragEvent,
  type MutableRefObject,
  useRef,
  useState,
} from "react";
import { finishNativeDrag } from "../drag/native-drag-feedback";

export type SidebarDragState =
  | { kind: "space"; spacePath: string }
  | { kind: "requirement"; spacePath: string; requirementId: string };

export function useWorkspaceSidebarDrag(
  onMoveSpace: (sourcePath: string, targetPath: string) => void,
  onMoveRequirement: (
    spacePath: string,
    sourceId: string,
    targetId: string,
  ) => void,
): {
  dragRef: MutableRefObject<SidebarDragState | null>;
  dropTarget: string | null;
  setDropTarget: (target: string) => void;
  clearDrag: () => void;
  handleSpaceDrop: (event: DragEvent<HTMLElement>, path: string) => void;
  handleRequirementDrop: (
    event: DragEvent<HTMLElement>,
    spacePath: string,
    requirementId: string,
  ) => void;
} {
  const dragRef = useRef<SidebarDragState | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const clearDrag = (): void => {
    finishNativeDrag(
      document.querySelector<HTMLElement>("[data-dragging='true']"),
    );
    dragRef.current = null;
    setDropTarget(null);
  };
  const handleSpaceDrop = (
    event: DragEvent<HTMLElement>,
    targetPath: string,
  ): void => {
    const activeDrag = dragRef.current;
    if (activeDrag?.kind !== "space") return;
    event.preventDefault();
    onMoveSpace(activeDrag.spacePath, targetPath);
    clearDrag();
  };
  const handleRequirementDrop = (
    event: DragEvent<HTMLElement>,
    targetSpacePath: string,
    targetRequirementId: string,
  ): void => {
    const activeDrag = dragRef.current;
    if (
      activeDrag?.kind !== "requirement" ||
      activeDrag.spacePath !== targetSpacePath
    ) return;
    event.preventDefault();
    onMoveRequirement(
      targetSpacePath,
      activeDrag.requirementId,
      targetRequirementId,
    );
    clearDrag();
  };
  return {
    dragRef,
    dropTarget,
    setDropTarget,
    clearDrag,
    handleSpaceDrop,
    handleRequirementDrop,
  };
}
