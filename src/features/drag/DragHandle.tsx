import { GripVertical } from "lucide-react";
import type { HTMLAttributes } from "react";
import { useLocalization } from "../../localization/LocalizationProvider";

type DragHandleProps = Omit<
  HTMLAttributes<HTMLSpanElement>,
  "aria-label" | "children"
> & {
  name: string;
  disabled?: boolean;
};

export function DragHandle({
  name,
  className,
  disabled = false,
  draggable = true,
  ...dragHandleProps
}: DragHandleProps): JSX.Element {
  const { t } = useLocalization();

  return (
    <span
      {...dragHandleProps}
      className={["reorder-drag-handle", className].filter(Boolean).join(" ")}
      role="img"
      aria-label={t("reorder.dragHandle", { name })}
      aria-disabled={disabled || undefined}
      draggable={!disabled && draggable}
      title={t("tooltip.dragToReorder")}
    >
      <GripVertical size={13} aria-hidden="true" />
    </span>
  );
}
