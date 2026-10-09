import { type CSSProperties, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type {
  NodeTodoDto,
  RequirementExecutionViewDto,
} from "../../../shared/business";
import { useLocalization } from "../../localization/LocalizationProvider";

type ExecutionRole =
  RequirementExecutionViewDto["nodes"][number]["executionRole"];

type NodeTodoTooltipProps = {
  anchor: HTMLElement;
  todo: NodeTodoDto;
  executionRole?: ExecutionRole;
  id: string;
};

const TOOLTIP_WIDTH = 240;
const TOOLTIP_GAP = 8;
const VIEWPORT_PADDING = 12;

export function NodeTodoTooltip({
  anchor,
  todo,
  executionRole,
  id,
}: NodeTodoTooltipProps): JSX.Element {
  const { locale, t } = useLocalization();
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<CSSProperties>({
    position: "fixed",
    visibility: "hidden",
  });

  useLayoutEffect(() => {
    const updatePosition = (): void => {
      const tooltip = tooltipRef.current;
      if (!tooltip) return;
      const bounds = anchor.getBoundingClientRect();
      const height = tooltip.scrollHeight;
      const openAbove =
        window.innerHeight - bounds.bottom - TOOLTIP_GAP < height &&
        bounds.top - TOOLTIP_GAP >= height;
      const maxLeft = window.innerWidth - TOOLTIP_WIDTH - VIEWPORT_PADDING;
      setPosition({
        position: "fixed",
        top: openAbove
          ? bounds.top - TOOLTIP_GAP - height
          : bounds.bottom + TOOLTIP_GAP,
        left: Math.min(
          Math.max(VIEWPORT_PADDING, bounds.left),
          Math.max(VIEWPORT_PADDING, maxLeft),
        ),
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

  const rows = [
    {
      label: t("requirementDetail.nodeTooltip.startedAt"),
      value: formatTimestamp(todo.createdAt, locale),
    },
    {
      label: t("requirementDetail.nodeTooltip.endedAt"),
      value: formatTimestamp(todo.completedAt, locale),
    },
    {
      label: t("requirementDetail.nodeTooltip.executionRole"),
      value: executionRoleLabel(executionRole, t),
    },
  ];

  return createPortal(
    <div
      ref={tooltipRef}
      id={id}
      className="requirement-dag-node-tooltip node-todo-tooltip"
      role="tooltip"
      style={position}
    >
      <dl>
        {rows.map((row) => (
          <div key={row.label} className="requirement-dag-node-tooltip-row">
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>,
    document.body,
  );
}

function executionRoleLabel(
  role: ExecutionRole,
  t: ReturnType<typeof useLocalization>["t"],
): string {
  if (!role) return "--";
  if (role.kind === "model") return role.label;
  return t(
    role.kind === "user"
      ? "requirementDetail.nodeTooltip.role.user"
      : "requirementDetail.nodeTooltip.role.system",
  );
}

function formatTimestamp(value: number | undefined, locale: string): string {
  if (value === undefined) return "--";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(value);
}
