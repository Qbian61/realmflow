import {
  CirclePlay,
  CircleStop,
  Pause,
  type LucideIcon,
} from "lucide-react";
import type { RequirementNode } from "../../../domain/workflow";
import type { WorkflowNodeControlAction } from "../../../shared/business";
import { useLocalization } from "../../localization/LocalizationProvider";
import type { TranslationKey } from "../../localization/translate";

type WorkflowNodeControlsProps = {
  node: RequirementNode;
  pending: boolean;
  onAction: (action: WorkflowNodeControlAction, reason?: string) => void;
};

export function WorkflowNodeControls({
  node,
  pending,
  onAction,
}: WorkflowNodeControlsProps): JSX.Element {
  const { t } = useLocalization();
  const actions: LifecycleControlAction[] = [];
  let primaryAction: LifecycleControlAction | undefined;
  if (node.status === "ready" && node.type === "ai_generate" && node.executor) {
    primaryAction = "start";
  } else if (
    node.status === "running" ||
    node.status === "waiting_user"
  ) {
    primaryAction = "pause";
  } else if (node.status === "paused") {
    primaryAction = "resume";
  }
  if (primaryAction) actions.push(primaryAction);
  if (
    node.status === "running" ||
    node.status === "waiting_user" ||
    node.status === "paused"
  ) {
    actions.push("cancel");
  }
  return (
    <div className="workflow-node-controls">
      {actions.map((action) => {
        const control = action === "resume" ? controls.start : controls[action];
        const label = t(control.label);
        const Icon = control.icon;
        return (
          <button
            key={action}
            type="button"
            className={[
              control.destructive ? "stage-run-cancel" : "stage-run-start",
              "workflow-node-control",
              control.destructive
                ? "is-danger"
                : "is-primary",
            ].join(" ")}
            aria-label={label}
            title={label}
            disabled={pending}
            onClick={() => onAction(action)}
          >
            <Icon size={14} />
            {t(control.text)}
          </button>
        );
      })}
    </div>
  );
}

type LifecycleControlAction = Exclude<
  WorkflowNodeControlAction,
  "retry" | "skip"
>;

const controls: Record<
  LifecycleControlAction,
  {
    label: TranslationKey;
    text: TranslationKey;
    icon: LucideIcon;
    destructive?: boolean;
  }
> = {
  start: {
    label: "workflowControls.start.label",
    text: "workflowControls.start.text",
    icon: CirclePlay,
  },
  pause: {
    label: "workflowControls.pause.label",
    text: "workflowControls.pause.text",
    icon: Pause,
  },
  resume: {
    label: "workflowControls.resume.label",
    text: "workflowControls.resume.text",
    icon: CirclePlay,
  },
  cancel: {
    label: "workflowControls.cancel.label",
    text: "workflowControls.cancel.text",
    icon: CircleStop,
    destructive: true,
  },
};
