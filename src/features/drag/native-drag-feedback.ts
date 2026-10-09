import type { DragEvent } from "react";

let activeGhost: HTMLElement | undefined;
let activeSource: HTMLElement | undefined;

const cancelOnEscape = (event: KeyboardEvent): void => {
  if (event.key !== "Escape") return;
  event.preventDefault();
  finishNativeDrag();
};

export function beginNativeDrag(
  event: DragEvent<HTMLElement>,
  source: HTMLElement,
): void {
  finishNativeDrag();
  source.dataset.dragging = "true";
  const ghost = source.cloneNode(true) as HTMLElement;
  const rect = source.getBoundingClientRect();
  ghost.classList.add("app-drag-ghost");
  ghost.setAttribute("aria-hidden", "true");
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  document.body.appendChild(ghost);
  activeSource = source;
  activeGhost = ghost;
  document.addEventListener("keydown", cancelOnEscape);
  event.dataTransfer?.setDragImage?.(
    ghost,
    Math.min(24, rect.width / 2),
    Math.min(18, rect.height / 2),
  );
}

export function finishNativeDrag(source?: HTMLElement | null): void {
  (source ?? activeSource)?.removeAttribute("data-dragging");
  activeGhost?.remove();
  document.removeEventListener("keydown", cancelOnEscape);
  activeSource = undefined;
  activeGhost = undefined;
}
