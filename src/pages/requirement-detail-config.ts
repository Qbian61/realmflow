import {
  Braces,
  ClipboardCheck,
  FileSearch,
  FlaskConical,
  RefreshCw,
  Rocket,
} from "lucide-react";
import type { NodeTodoDto } from "../../shared/business";
import type { TranslationKey, Translator } from "../localization/translate";

const nodeTodoStatusLabelKeys: Record<NodeTodoDto["status"], TranslationKey> = {
  pending: "todo.status.pending",
  in_progress: "todo.status.inProgress",
  completed: "todo.status.completed",
  blocked: "todo.status.blocked",
  cancelled: "todo.status.cancelled",
};

export const lifecycleStages = [
  { id: "analysis", labelKey: "stage.analysis", icon: FileSearch },
  { id: "design", labelKey: "stage.design", icon: ClipboardCheck },
  { id: "implementation", labelKey: "stage.implementation", icon: Braces },
  { id: "testing", labelKey: "stage.testing", icon: FlaskConical },
  { id: "release", labelKey: "stage.release", icon: Rocket },
  {
    id: "retrospective",
    labelKey: "stage.retrospective",
    icon: RefreshCw,
  },
] as const;

export function nodeTodoStatusLabel(
  t: Translator,
  status: NodeTodoDto["status"],
): string {
  return t(nodeTodoStatusLabelKeys[status]);
}

export function createTodoDraftId(): string {
  return globalThis.crypto.randomUUID();
}

export function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
