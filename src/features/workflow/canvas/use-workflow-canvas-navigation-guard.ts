import { useRef, useState } from "react";
import { useUnsavedChangesGuard } from "../../unsaved-changes/UnsavedChangesProvider";
import type { WorkflowNodeInspectorHandle } from "./WorkflowNodeInspector";

export function useWorkflowCanvasNavigationGuard(
  restoreSelection: () => void,
) {
  const inspectorRef = useRef<WorkflowNodeInspectorHandle>(null);
  const [dirty, setDirty] = useState(false);
  const guard = useUnsavedChangesGuard({
    id: "workflow-canvas-inspector",
    dirty,
    save: async () => {
      const saved = (await inspectorRef.current?.save()) ?? false;
      if (saved) setDirty(false);
      return saved;
    },
    discard: () => {
      inspectorRef.current?.discard();
      setDirty(false);
    },
    onStay: restoreSelection,
  });

  return {
    inspectorRef,
    dirty,
    setDirty,
    request: guard.request,
  };
}
