import {
  Calendar,
  Circle,
  Link,
  ListChecks,
  Paperclip,
  Type,
  type LucideIcon,
} from "lucide-react";
import type { WorkbenchTaskFieldType } from "../../../../shared/workbench-tasks";

const FIELD_TYPE_ICONS: Record<WorkbenchTaskFieldType, LucideIcon> = {
  text: Type,
  date: Calendar,
  single_select: Circle,
  multi_select: ListChecks,
  url: Link,
  attachment: Paperclip,
};

export function TaskTableFieldTypeIcon({
  fieldType,
}: {
  fieldType: WorkbenchTaskFieldType;
}): JSX.Element {
  const Icon = FIELD_TYPE_ICONS[fieldType];
  return (
    <Icon
      className="workbench-task-field-type-icon"
      data-field-type={fieldType}
      size={13}
      strokeWidth={1.8}
      aria-hidden="true"
    />
  );
}
