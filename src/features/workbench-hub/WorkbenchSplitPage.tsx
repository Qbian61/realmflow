import {
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
} from "lucide-react";
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button, IconButton } from "../../components/ui";
import { useLocalization } from "../../localization/LocalizationProvider";

const DEFAULT_SPLIT_WIDTH = 184;
const MIN_SPLIT_WIDTH = 120;
const MAX_SPLIT_WIDTH = 360;
const SPLIT_WIDTH_STEP = 8;
const SPLIT_WIDTH_KEY = "realmflow:workbench-split-width";
const SPLIT_WIDTH_EVENT = "realmflow:workbench-split-width-change";

type WorkbenchSplitPageProps = {
  navigation: ReactNode;
  navigationActions?: ReactNode;
  children: ReactNode;
  createLabel: string;
  onCreate: () => void;
  createIconOnly?: boolean;
  floatingActionLabel?: string;
  onFloatingAction?: () => void;
};

function clampSplitWidth(width: number): number {
  return Math.min(MAX_SPLIT_WIDTH, Math.max(MIN_SPLIT_WIDTH, width));
}

function readSplitWidth(): number {
  const storedWidth = Number(window.localStorage.getItem(SPLIT_WIDTH_KEY));
  return Number.isFinite(storedWidth) && storedWidth > 0
    ? clampSplitWidth(storedWidth)
    : DEFAULT_SPLIT_WIDTH;
}

export function WorkbenchSplitPage({
  navigation,
  navigationActions,
  children,
  createLabel,
  onCreate,
  createIconOnly = false,
  floatingActionLabel,
  onFloatingAction,
}: WorkbenchSplitPageProps): JSX.Element {
  const { t } = useLocalization();
  const [collapsed, setCollapsed] = useState(false);
  const [splitWidth, setSplitWidth] = useState(readSplitWidth);
  const [resizing, setResizing] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);
  const pageStyle = {
    "--workbench-split-width": `${splitWidth}px`,
  } as CSSProperties;

  useEffect(() => {
    const syncSplitWidth = (event: Event): void => {
      const width = (event as CustomEvent<number>).detail;
      if (Number.isFinite(width)) setSplitWidth(clampSplitWidth(width));
    };
    window.addEventListener(SPLIT_WIDTH_EVENT, syncSplitWidth);
    return () => window.removeEventListener(SPLIT_WIDTH_EVENT, syncSplitWidth);
  }, []);

  const updateSplitWidth = (width: number): void => {
    const nextWidth = clampSplitWidth(width);
    setSplitWidth(nextWidth);
    window.localStorage.setItem(SPLIT_WIDTH_KEY, String(nextWidth));
    window.dispatchEvent(
      new CustomEvent<number>(SPLIT_WIDTH_EVENT, { detail: nextWidth }),
    );
  };

  const handleResizeKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ): void => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    updateSplitWidth(
      splitWidth +
        (event.key === "ArrowRight" ? SPLIT_WIDTH_STEP : -SPLIT_WIDTH_STEP),
    );
  };

  const handleResizeMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ): void => {
    if (!resizing) return;
    const pageLeft = pageRef.current?.getBoundingClientRect().left ?? 0;
    updateSplitWidth(event.clientX - pageLeft);
  };

  return (
    <div
      ref={pageRef}
      className="workbench-split-page"
      data-collapsed={collapsed}
      data-resizing={resizing}
      data-testid="workbench-split-page"
      style={pageStyle}
    >
      <aside className="workbench-split-navigation">
        {collapsed ? null : (
          <nav
            className="workbench-split-navigation-list"
            aria-label={t("workbenchHub.split.navigation")}
          >
            {navigation}
          </nav>
        )}
        <footer className="workbench-split-navigation-tools">
          {collapsed ? null : (
            <>
              {createIconOnly ? (
                <IconButton
                  size="default"
                  variant="ghost"
                  aria-label={createLabel}
                  onClick={onCreate}
                  title={t("tooltip.add")}
                >
                  <Plus size={16} aria-hidden="true" />
                </IconButton>
              ) : (
                <Button
                  size="default"
                  variant="ghost"
                  leadingIcon={<Plus size={16} aria-hidden="true" />}
                  onClick={onCreate}
                >
                  {createLabel}
                </Button>
              )}
              {navigationActions}
            </>
          )}
          <IconButton
            size="default"
            variant="ghost"
            className="workbench-split-collapse"
            aria-label={t(
              collapsed
                ? "workbenchHub.split.expand"
                : "workbenchHub.split.collapse",
            )}
            title={t(
              collapsed
                ? "workbenchHub.split.expand"
                : "workbenchHub.split.collapse",
            )}
            onClick={() => setCollapsed((current) => !current)}
          >
            {collapsed ? (
              <PanelLeftOpen size={16} aria-hidden="true" />
            ) : (
              <PanelLeftClose size={16} aria-hidden="true" />
            )}
          </IconButton>
        </footer>
      </aside>
      {collapsed ? null : (
        <div
          className="workbench-split-resizer"
          role="separator"
          aria-label={t("workbenchHub.split.resize")}
          aria-orientation="vertical"
          aria-valuemin={MIN_SPLIT_WIDTH}
          aria-valuemax={MAX_SPLIT_WIDTH}
          aria-valuenow={splitWidth}
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
      <section
        className="workbench-split-content"
        aria-label={t("workbenchHub.split.content")}
      >
        {children}
      </section>
      {floatingActionLabel && onFloatingAction ? (
        <IconButton
          size="comfortable"
          variant="primary"
          className="workbench-split-fab"
          aria-label={floatingActionLabel}
          title={t("tooltip.add")}
          onClick={onFloatingAction}
        >
          <Plus size={18} aria-hidden="true" />
        </IconButton>
      ) : null}
    </div>
  );
}
