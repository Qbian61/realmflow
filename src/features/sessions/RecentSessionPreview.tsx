import { Clock3, Folder, Monitor } from "lucide-react";
import {
  type CSSProperties,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

type RecentSessionPreviewProps = {
  anchor: HTMLElement;
  context: string;
  id: string;
  title: string;
  type: string;
  updatedAt: string;
  onDismiss: () => void;
};

type PreviewPosition = {
  top: number;
  left: number;
  arrowTop: number;
  placement: "left" | "right";
  visible: boolean;
};

const PREVIEW_WIDTH = 246;
const PREVIEW_GAP = 24;
const VIEWPORT_PADDING = 12;

export function RecentSessionPreview({
  anchor,
  context,
  id,
  title,
  type,
  updatedAt,
  onDismiss,
}: RecentSessionPreviewProps): JSX.Element {
  const previewRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<PreviewPosition>({
    top: 0,
    left: 0,
    arrowTop: 20,
    placement: "right",
    visible: false,
  });

  useLayoutEffect(() => {
    const updatePosition = (): void => {
      const preview = previewRef.current;
      if (!preview || !anchor.isConnected) {
        onDismiss();
        return;
      }
      const anchorBounds = anchor.getBoundingClientRect();
      const previewBounds = preview.getBoundingClientRect();
      const height = previewBounds.height || 114;
      const contentBoundary =
        anchor.closest(".app-shell")?.querySelector<HTMLElement>(".app-content")
          ?.getBoundingClientRect().left;
      const rightPlacementLeft =
        contentBoundary !== undefined
          ? contentBoundary
          : anchorBounds.right + PREVIEW_GAP;
      const placement =
        window.innerWidth - rightPlacementLeft >= PREVIEW_WIDTH ||
        anchorBounds.left - PREVIEW_GAP < PREVIEW_WIDTH
          ? "right"
          : "left";
      const unclampedLeft =
        placement === "right"
          ? rightPlacementLeft
          : anchorBounds.left - PREVIEW_GAP - PREVIEW_WIDTH;
      const left = Math.min(
        Math.max(VIEWPORT_PADDING, unclampedLeft),
        Math.max(
          VIEWPORT_PADDING,
          window.innerWidth - PREVIEW_WIDTH - VIEWPORT_PADDING,
        ),
      );
      const top = Math.min(
        Math.max(
          VIEWPORT_PADDING,
          anchorBounds.top + anchorBounds.height / 2 - height / 2,
        ),
        Math.max(VIEWPORT_PADDING, window.innerHeight - height - VIEWPORT_PADDING),
      );
      setPosition({
        top,
        left,
        arrowTop: Math.min(
          Math.max(18, anchorBounds.top + anchorBounds.height / 2 - top),
          height - 18,
        ),
        placement,
        visible: true,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", onDismiss, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", onDismiss, true);
    };
  }, [anchor, onDismiss]);

  return createPortal(
    <div
      ref={previewRef}
      id={id}
      className="recent-session-preview"
      role="tooltip"
      data-placement={position.placement}
      style={
        {
          top: position.top,
          left: position.left,
          visibility: position.visible ? "visible" : "hidden",
        } satisfies CSSProperties
      }
    >
      <strong className="recent-session-preview-title">{title}</strong>
      <div className="recent-session-preview-details">
        <div className="recent-session-preview-row">
          <Monitor size={15} aria-hidden="true" />
          <span>{type}</span>
        </div>
        <div className="recent-session-preview-row">
          <Folder size={15} aria-hidden="true" />
          <span className="recent-session-preview-path">{context}</span>
        </div>
        <div className="recent-session-preview-row">
          <Clock3 size={15} aria-hidden="true" />
          <span>{updatedAt}</span>
        </div>
      </div>
      <span
        className="recent-session-preview-arrow"
        aria-hidden="true"
        style={{ top: position.arrowTop - 5 }}
      />
    </div>,
    document.body,
  );
}
