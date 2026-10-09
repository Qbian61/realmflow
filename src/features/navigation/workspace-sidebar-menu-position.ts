const VIEWPORT_MENU_MARGIN = 8;

export type ViewportMenuPosition = { top: number; right: number };

export function getViewportMenuPosition(
  bounds: DOMRect,
  menuHeight: number,
): ViewportMenuPosition {
  const preferredTop = bounds.bottom + 5;
  return {
    top:
      preferredTop + menuHeight <= window.innerHeight - VIEWPORT_MENU_MARGIN
        ? preferredTop
        : Math.max(VIEWPORT_MENU_MARGIN, bounds.top - menuHeight - 5),
    right: Math.max(VIEWPORT_MENU_MARGIN, window.innerWidth - bounds.right),
  };
}
