import {
  History,
  RotateCcw,
  SkipForward,
  type LucideIcon,
} from "lucide-react";
import {
  type CSSProperties,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type {
  RequirementNodeActionCapabilityDto,
  RequirementNodeActionDisabledReason,
} from "../../../shared/business";
import { Menu, MenuContent, MenuItem } from "../../components/ui";
import { useLocalization } from "../../localization/LocalizationProvider";
import type { TranslationKey } from "../../localization/translate";

export type WorkflowNodeAction = "retry" | "skip" | "rollback";

type WorkflowNodeActionMenuProps = {
  nodeName: string;
  capabilities: Record<
    WorkflowNodeAction,
    RequirementNodeActionCapabilityDto
  >;
  pending: boolean;
  anchor: HTMLButtonElement;
  onAction: (action: WorkflowNodeAction) => void;
  onClose: () => void;
};

const actions: Array<{
  id: WorkflowNodeAction;
  label: TranslationKey;
  icon: LucideIcon;
}> = [
  { id: "retry", label: "workflowNodeActionMenu.action.retry", icon: RotateCcw },
  { id: "skip", label: "workflowNodeActionMenu.action.skip", icon: SkipForward },
  {
    id: "rollback",
    label: "workflowNodeActionMenu.action.rollback",
    icon: History,
  },
];

const MENU_WIDTH = 220;
const MENU_GAP = 8;
const VIEWPORT_PADDING = 12;

const disabledReasons: Record<
  RequirementNodeActionDisabledReason,
  TranslationKey
> = {
  node_run_missing: "workflowNodeActionMenu.disabled.nodeRunMissing",
  invalid_state: "workflowNodeActionMenu.disabled.invalidState",
  not_executable: "workflowNodeActionMenu.disabled.notExecutable",
  retry_limit_reached: "workflowNodeActionMenu.disabled.retryLimitReached",
  skip_not_allowed: "workflowNodeActionMenu.disabled.skipNotAllowed",
  node_already_started: "workflowNodeActionMenu.disabled.nodeAlreadyStarted",
  no_execution_history: "workflowNodeActionMenu.disabled.noExecutionHistory",
};

export function WorkflowNodeActionMenu({
  nodeName,
  capabilities,
  pending,
  anchor,
  onAction,
  onClose,
}: WorkflowNodeActionMenuProps): JSX.Element | null {
  const { t } = useLocalization();
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<CSSProperties>({
    position: "fixed",
    visibility: "hidden",
  });
  const handleOpenChange = useCallback(
    (nextOpen: boolean): void => {
      if (!nextOpen) onClose();
    },
    [onClose],
  );

  useLayoutEffect(() => {
    const updatePosition = (): void => {
      const menu = menuRef.current;
      if (!menu) return;
      const bounds = anchor.getBoundingClientRect();
      const availableAbove = Math.max(
        0,
        bounds.top - MENU_GAP - VIEWPORT_PADDING,
      );
      const availableBelow = Math.max(
        0,
        window.innerHeight - bounds.bottom - MENU_GAP - VIEWPORT_PADDING,
      );
      const openAbove =
        menu.scrollHeight > availableBelow &&
        availableAbove > availableBelow;
      const maxHeight = Math.max(
        120,
        openAbove ? availableAbove : availableBelow,
      );
      const visibleHeight = Math.min(menu.scrollHeight, maxHeight);
      const maxLeft = window.innerWidth - MENU_WIDTH - VIEWPORT_PADDING;
      const left = Math.min(
        Math.max(VIEWPORT_PADDING, bounds.right - MENU_WIDTH),
        maxLeft,
      );
      const top = openAbove
        ? bounds.top - MENU_GAP - visibleHeight
        : bounds.bottom + MENU_GAP;

      setPosition({
        position: "fixed",
        top,
        left,
        maxHeight,
        visibility: "visible",
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchor]);

  return createPortal(
    <Menu
      open
      onOpenChange={handleOpenChange}
      trigger={anchor}
    >
      <MenuContent
        ref={menuRef}
        className="workflow-node-quick-menu"
        aria-label={t("workflowNodeActionMenu.title", { name: nodeName })}
        tabIndex={-1}
        style={position}
        onClick={(event) => event.stopPropagation()}
      >
        {actions.map((action) => {
          const capability = capabilities[action.id];
          const reason = pending
            ? t("workflowNodeActionMenu.pending")
            : capability.enabled
              ? undefined
              : t(disabledReasons[capability.reasonCode]);
          const label = t(action.label);
          const Icon = action.icon;

          return (
            <MenuItem
              key={action.id}
              aria-label={
                reason
                  ? t("workflowNodeActionMenu.unavailable", {
                      action: label,
                      reason,
                    })
                  : label
              }
              title={reason}
              disabled={reason !== undefined}
              onSelect={() => onAction(action.id)}
            >
              <Icon size={16} aria-hidden="true" />
              <span className="workflow-node-quick-menu-copy">
                <span>{label}</span>
                {reason ? (
                  <small className="workflow-node-quick-menu-reason">
                    {reason}
                  </small>
                ) : null}
              </span>
            </MenuItem>
          );
        })}
      </MenuContent>
    </Menu>,
    document.body,
  );
}
