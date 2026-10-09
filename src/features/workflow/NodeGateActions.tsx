import { Check, X } from "lucide-react";
import { useState } from "react";
import type { RequirementNode } from "../../../domain/workflow";
import type {
  NodeApprovalDto,
  ResolveWorkflowNodeGateCommand,
} from "../../../shared/business";
import { Button, Field } from "../../components/ui";
import { useLocalization } from "../../localization/LocalizationProvider";

type NodeGateActionsProps = {
  node: RequirementNode | undefined;
  approval?: NodeApprovalDto;
  disabled: boolean;
  onResolve: (gate: ResolveWorkflowNodeGateCommand["gate"]) => Promise<void>;
};

const resolvableStatuses: RequirementNode["status"][] = [
  "ready",
  "running",
  "waiting_user",
];

export function NodeGateActions({
  node,
  approval,
  disabled,
  onResolve,
}: NodeGateActionsProps): JSX.Element | null {
  const { locale, t } = useLocalization();
  const [note, setNote] = useState("");
  if (!node) return null;
  const resolvable = resolvableStatuses.includes(node.status);
  const approvalRequired =
    node.type === "approval" || node.completionGate?.requireApproval === true;
  const customGateId = node.completionGate?.customGateId;
  if (!resolvable && !(approvalRequired && approval)) return null;

  const resolveApproval = (result: "approved" | "rejected"): void => {
    const normalizedNote = note.trim();
    void onResolve({
      kind: "approval",
      decisionId: createApprovalDecisionId(),
      expectedApprovalRevision: approval?.revision ?? 0,
      result,
      ...(normalizedNote ? { note: normalizedNote } : {}),
    });
  };

  return (
    <div className="stage-run-gates">
      {approvalRequired && approval ? (
        <div className={`node-approval-summary ${approval.result}`}>
          <div>
            <strong>
              {approval.result === "approved"
                ? t("workflowGate.approved")
                : t("workflowGate.rejected")}
            </strong>
            <span>
              {approval.actorType === "local_user"
                ? t("workflowGate.localUser")
                : approval.actorId}
            </span>
            <time dateTime={new Date(approval.decidedAt).toISOString()}>
              {new Date(approval.decidedAt).toLocaleString(locale)}
            </time>
          </div>
          {approval.note ? <p>{approval.note}</p> : null}
        </div>
      ) : null}
      {approvalRequired && resolvable ? (
        <div className="node-approval-controls">
          <Field name="workflow-gate-note"
            className="node-approval-field node-field--visually-hidden-label"
            label={t("workflowGate.note")}
            disabled={disabled}
          >
            <textarea
              className="node-approval-note"
              maxLength={2_000}
              placeholder={t("workflowGate.note")}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
          <div className="stage-run-gate-actions">
            <Button
              variant="primary"
              aria-label={t("workflowGate.approveNode")}
              disabled={disabled}
              leadingIcon={<Check size={14} />}
              onClick={() => resolveApproval("approved")}
            >
              {t("workflowGate.approve")}
            </Button>
            <Button
              variant="danger"
              aria-label={t("workflowGate.rejectNode")}
              disabled={disabled}
              leadingIcon={<X size={14} />}
              onClick={() => resolveApproval("rejected")}
            >
              {t("workflowGate.reject")}
            </Button>
          </div>
        </div>
      ) : null}
      {customGateId && resolvable ? (
        <div className="stage-run-gate-actions">
          <Button
            variant="primary"
            aria-label={t("workflowGate.passCustom")}
            disabled={disabled}
            leadingIcon={<Check size={14} />}
            onClick={() =>
              void onResolve({
                kind: "custom",
                gateId: customGateId,
                passed: true,
              })
            }
          >
            {t("workflowGate.pass")}
          </Button>
          <Button
            variant="danger"
            aria-label={t("workflowGate.failCustom")}
            disabled={disabled}
            leadingIcon={<X size={14} />}
            onClick={() =>
              void onResolve({
                kind: "custom",
                gateId: customGateId,
                passed: false,
              })
            }
          >
            {t("workflowGate.fail")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function createApprovalDecisionId(): string {
  return globalThis.crypto.randomUUID();
}
