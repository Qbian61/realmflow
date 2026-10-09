import {
  type DragEvent,
  type DragEventHandler,
  type RefObject,
  useState,
} from "react";
import { beginNativeDrag, finishNativeDrag } from "./native-drag-feedback";

type DropHandler = (sourceIndex: number, targetIndex: number) => void;

export function useNativeListDrag(
  containerRef: RefObject<HTMLElement>,
): {
  sourceProps: (index: number) => {
    onDragStart: DragEventHandler<HTMLButtonElement>;
    onDragEnd: () => void;
  };
  targetProps: (
    index: number,
    onDrop: DropHandler,
  ) => {
    "data-dragging": true | undefined;
    "data-drop-target": "before" | undefined;
    onDragOver: DragEventHandler<HTMLElement>;
    onDrop: DragEventHandler<HTMLElement>;
  };
} {
  const [sourceIndex, setSourceIndex] = useState<number>();
  const [targetIndex, setTargetIndex] = useState<number>();

  const clear = (): void => {
    finishNativeDrag(
      containerRef.current?.querySelector<HTMLElement>(
        "[data-dragging='true']",
      ),
    );
    setSourceIndex(undefined);
    setTargetIndex(undefined);
  };

  return {
    sourceProps: (index) => ({
      onDragStart: (event: DragEvent<HTMLButtonElement>) => {
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
        beginNativeDrag(event, event.currentTarget.parentElement!);
        setSourceIndex(index);
      },
      onDragEnd: clear,
    }),
    targetProps: (index, onDrop) => ({
      "data-dragging": sourceIndex === index || undefined,
      "data-drop-target": targetIndex === index ? "before" : undefined,
      onDragOver: (event) => {
        event.preventDefault();
        setTargetIndex(index);
      },
      onDrop: (event) => {
        event.preventDefault();
        if (sourceIndex === undefined) return;
        const currentSource = sourceIndex;
        clear();
        if (currentSource !== index) onDrop(currentSource, index);
      },
    }),
  };
}
