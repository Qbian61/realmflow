import {
  createContext,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useContext,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import {
  WorkspaceSidebar,
  type WorkspaceSidebarProps,
} from "./WorkspaceSidebar";
import { useWorkspacePageActive } from "./WorkspaceRouteCache";
import { useLocalization } from "../../localization/LocalizationProvider";

const DEFAULT_SIDEBAR_WIDTH = 248;
const MIN_SIDEBAR_WIDTH = 220;
const MAX_SIDEBAR_WIDTH = 420;
const MIN_CONTENT_WIDTH = 320;
const CONTENT_PANEL_INSET = 8;
const CONTENT_PANEL_HORIZONTAL_INSET = CONTENT_PANEL_INSET * 2;
const SIDEBAR_WIDTH_KEY = "realmflow:sidebar-width";
const WorkspaceHeaderContext = createContext<HTMLDivElement | null | undefined>(
  undefined,
);

type WorkspaceLayoutProps = Omit<WorkspaceSidebarProps, "visible"> & {
  children: ReactNode;
  status?: ReactNode;
};

export function WorkspaceHeaderPortal({
  children,
}: {
  children: ReactNode;
}): JSX.Element | null {
  const headerHost = useContext(WorkspaceHeaderContext);
  const pageActive = useWorkspacePageActive();
  if (headerHost === undefined) return <>{children}</>;
  return headerHost && pageActive ? createPortal(children, headerHost) : null;
}

function readSidebarWidth(): number {
  const storedValue = window.localStorage.getItem(SIDEBAR_WIDTH_KEY);
  if (storedValue === null) return DEFAULT_SIDEBAR_WIDTH;
  const storedWidth = Number(storedValue);
  if (!Number.isFinite(storedWidth)) return DEFAULT_SIDEBAR_WIDTH;
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, storedWidth));
}

export function WorkspaceLayout({
  children,
  status,
  ...sidebarProps
}: WorkspaceLayoutProps): JSX.Element {
  const { t } = useLocalization();
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(readSidebarWidth);
  const [resizing, setResizing] = useState(false);
  const [headerHost, setHeaderHost] = useState<HTMLDivElement | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const shellStyle = {
    "--sidebar-width": sidebarVisible ? `${sidebarWidth}px` : "0px",
  } as CSSProperties;
  const focusMainContent = (): void => {
    document.getElementById("main-content")?.focus();
  };

  const updateSidebarWidth = (width: number): void => {
    const shellWidth = shellRef.current?.getBoundingClientRect().width ?? 0;
    const content =
      shellRef.current?.querySelector<HTMLElement>(".app-content");
    const contentStyles = content
      ? window.getComputedStyle(content)
      : undefined;
    const measuredContentInset = contentStyles
      ? Number.parseFloat(contentStyles.marginLeft) +
        Number.parseFloat(contentStyles.marginRight)
      : Number.NaN;
    const contentHorizontalInset = Number.isFinite(measuredContentInset)
      ? measuredContentInset
      : CONTENT_PANEL_HORIZONTAL_INSET;
    const availableMaxWidth =
      shellWidth > 0
        ? shellWidth - MIN_CONTENT_WIDTH - contentHorizontalInset
        : MAX_SIDEBAR_WIDTH;
    const effectiveMaxWidth = Math.max(
      MIN_SIDEBAR_WIDTH,
      Math.min(MAX_SIDEBAR_WIDTH, availableMaxWidth),
    );
    const nextWidth = Math.min(
      effectiveMaxWidth,
      Math.max(MIN_SIDEBAR_WIDTH, width),
    );
    setSidebarWidth(nextWidth);
    window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(nextWidth));
  };

  const handleResizeKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ): void => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    updateSidebarWidth(sidebarWidth + (event.key === "ArrowRight" ? 8 : -8));
  };

  const handleResizeMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (resizing) updateSidebarWidth(event.clientX - CONTENT_PANEL_INSET);
  };

  return (
    <WorkspaceHeaderContext.Provider value={headerHost}>
      <div
        ref={shellRef}
        className={resizing ? "app-shell resizing" : "app-shell"}
        style={shellStyle}
        data-testid="app-shell"
      >
        <a
          className="skip-link"
          href="#main-content"
          onClick={(event) => {
            event.preventDefault();
            focusMainContent();
          }}
        >
          {t("layout.skipToMainContent")}
        </a>
        <WorkspaceSidebar visible={sidebarVisible} {...sidebarProps} />

        {sidebarVisible && (
          <div
            className="sidebar-resizer"
            role="separator"
            aria-label={t("layout.resizeSidebar")}
            aria-orientation="vertical"
            aria-valuemin={MIN_SIDEBAR_WIDTH}
            aria-valuemax={MAX_SIDEBAR_WIDTH}
            aria-valuenow={sidebarWidth}
            tabIndex={0}
            onKeyDown={handleResizeKeyDown}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              setResizing(true);
            }}
            onPointerMove={handleResizeMove}
            onPointerUp={(event) => {
              event.currentTarget.releasePointerCapture(event.pointerId);
              setResizing(false);
            }}
            onPointerCancel={() => setResizing(false)}
          />
        )}

        <div
          className={status ? "app-content has-status" : "app-content"}
          data-testid="app-content"
        >
          <header
            className={`app-content-header ${
              sidebarVisible ? "sidebar-open" : "sidebar-closed"
            }`}
            aria-label={t("layout.toolbar")}
          >
            <button
              className="sidebar-edge-toggle"
              type="button"
              aria-label={
                sidebarVisible
                  ? t("layout.hideSidebar")
                  : t("layout.showSidebar")
              }
              title={
                sidebarVisible
                  ? t("layout.hideSidebar")
                  : t("layout.showSidebar")
              }
              onClick={() => setSidebarVisible((visible) => !visible)}
            >
              {sidebarVisible ? (
                <PanelLeftClose size={18} strokeWidth={1.8} />
              ) : (
                <PanelLeftOpen size={18} strokeWidth={1.8} />
              )}
            </button>
            <div
              ref={setHeaderHost}
              className="app-content-header-slot"
              data-testid="workspace-header-content"
            />
          </header>
          {status}
          <div className="app-content-body">{children}</div>
        </div>
      </div>
    </WorkspaceHeaderContext.Provider>
  );
}
