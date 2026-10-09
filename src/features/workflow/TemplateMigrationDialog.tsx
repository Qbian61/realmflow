import { ArrowRight, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  TemplateMigrationCandidateListDto,
  TemplateMigrationPreviewDto,
} from "../../../shared/business";
import type {
  TemplateMigrationChangedField,
  TemplateMigrationUpdatedNode,
} from "../../../domain/template-migration";
import type { RequirementWorkflow } from "../../../domain/workflow";
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Field,
  IconButton,
  Spinner,
} from "../../components/ui";
import { useLocalization } from "../../localization/LocalizationProvider";
import type { TranslationKey } from "../../localization/translate";
import { useWorkspacePageActive } from "../navigation/WorkspaceRouteCache";
import { useToast } from "../toast/ToastProvider";

type TemplateMigrationDialogProps = {
  requirementId: string;
  onApplied: (workflow: RequirementWorkflow) => void;
  onClose: () => void;
};

export function TemplateMigrationDialog({
  requirementId,
  onApplied,
  onClose,
}: TemplateMigrationDialogProps): JSX.Element {
  const { t } = useLocalization();
  const toast = useToast();
  const pageActive = useWorkspacePageActive();
  const [candidates, setCandidates] =
    useState<TemplateMigrationCandidateListDto>();
  const [targetId, setTargetId] = useState("");
  const [preview, setPreview] = useState<TemplateMigrationPreviewDto>();
  const [loadingCandidates, setLoadingCandidates] = useState(true);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const previewSequence = useRef(0);
  const requestId = useRef(createRequestId());

  const loadPreview = useCallback(
    async (nextTargetId: string): Promise<void> => {
      const business = window.realmflow?.business;
      if (!business || !nextTargetId) return;
      const sequence = ++previewSequence.current;
      setLoadingPreview(true);
      setError("");
      try {
        const next = await business.previewTemplateMigration({
          requirementId,
          targetTemplateVersionId: nextTargetId,
        });
        if (sequence === previewSequence.current) setPreview(next);
      } catch (cause) {
        if (sequence !== previewSequence.current) return;
        setPreview(undefined);
        setError(
          t("templateMigration.previewFailed", {
            error: errorMessage(cause, t("common.unknownError")),
          }),
        );
      } finally {
        if (sequence === previewSequence.current) setLoadingPreview(false);
      }
    },
    [requirementId, t],
  );

  const loadCandidates = useCallback(async (): Promise<string> => {
    const business = window.realmflow?.business;
    if (!business) return "";
    setLoadingCandidates(true);
    try {
      const next = await business.listTemplateMigrationCandidates({
        requirementId,
      });
      setCandidates(next);
      const nextTargetId = next.candidates[0]?.id ?? "";
      setTargetId(nextTargetId);
      if (!nextTargetId) {
        previewSequence.current += 1;
        setPreview(undefined);
      }
      return nextTargetId;
    } catch (cause) {
      setError(
        t("templateMigration.loadFailed", {
          error: errorMessage(cause, t("common.unknownError")),
        }),
      );
      return "";
    } finally {
      setLoadingCandidates(false);
    }
  }, [requirementId, t]);

  useEffect(() => {
    let disposed = false;
    void loadCandidates().then((nextTargetId) => {
      if (!disposed && nextTargetId) void loadPreview(nextTargetId);
    });
    return () => {
      disposed = true;
      previewSequence.current += 1;
    };
  }, [loadCandidates, loadPreview]);

  const selectTarget = (nextTargetId: string): void => {
    setTargetId(nextTargetId);
    setPreview(undefined);
    void loadPreview(nextTargetId);
  };

  const apply = async (): Promise<void> => {
    const business = window.realmflow?.business;
    if (!business || !preview || pending) return;
    setPending(true);
    setError("");
    try {
      const result = await business.applyTemplateMigration({
        requestId: requestId.current,
        requirementId,
        targetTemplateVersionId: preview.targetVersion.id,
        expectedRequirementRevision: preview.requirementRevision,
        expectedWorkflowRevision: preview.workflowRevision,
        expectedExecutionRevision: preview.executionRevision,
      });
      onApplied(result.workflow);
      onClose();
    } catch (cause) {
      if (isRevisionConflict(cause)) {
        const nextTargetId = await loadCandidates();
        if (nextTargetId) await loadPreview(nextTargetId);
        setError(t("templateMigration.conflictRefreshed"));
      } else {
        toast.error("templateMigration.applyFailed", {
          values: { error: t("common.unknownError") },
          dedupeKey: "template-migration-apply-failed",
        });
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open
      size="wide"
      locked={pending || !pageActive}
      aria-labelledby="template-migration-title"
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <div className="template-migration-dialog">
        <DialogHeader>
          <div>
            <span>{t("templateMigration.eyebrow")}</span>
            <h2 id="template-migration-title">
              {t("templateMigration.title")}
            </h2>
          </div>
          <IconButton
            aria-label={t("templateMigration.close")}
            title={t("templateMigration.close")}
            variant="ghost"
            disabled={pending}
            onClick={onClose}
          >
            <X size={18} />
          </IconButton>
        </DialogHeader>

        <DialogBody className="template-migration-body">
          {loadingCandidates ? (
            <p className="template-migration-status" role="status">
              <Spinner size={16} />
              {t("templateMigration.loadingCandidates")}
            </p>
          ) : candidates && candidates.candidates.length === 0 ? (
            <div className="template-migration-empty">
              <strong>{t("templateMigration.noCandidates")}</strong>
              <span>{t("templateMigration.noCandidatesHint")}</span>
            </div>
          ) : candidates ? (
            <>
              <div className="template-migration-version-row">
                <VersionSummary
                  label={t("templateMigration.currentVersion")}
                  version={candidates.currentVersion.version}
                  nodeCount={candidates.currentVersion.nodeCount}
                  edgeCount={candidates.currentVersion.edgeCount}
                />
                <ArrowRight size={18} aria-hidden="true" />
                <Field name="template-migration-target-version" label={t("templateMigration.targetVersion")}>
                  <select
                    aria-label={t("templateMigration.targetVersion")}
                    value={targetId}
                    disabled={pending}
                    onChange={(event) => selectTarget(event.target.value)}
                  >
                    {candidates.candidates.map((candidate) => (
                      <option value={candidate.id} key={candidate.id}>
                        {t("templateMigration.version", {
                          version: candidate.version,
                        })}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              {loadingPreview ? (
                <p className="template-migration-status" role="status">
                  <Spinner size={16} />
                  {t("templateMigration.loadingPreview")}
                </p>
              ) : preview ? (
                <MigrationDiff preview={preview} />
              ) : null}
            </>
          ) : null}
          {error ? <p role="alert">{error}</p> : null}
        </DialogBody>

        <DialogFooter>
          <Button type="button" disabled={pending} onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            variant="primary"
            loading={pending}
            disabled={!preview || loadingPreview || pending}
            onClick={() => void apply()}
          >
            {t("templateMigration.confirm")}
          </Button>
        </DialogFooter>
      </div>
    </Dialog>
  );
}

function VersionSummary({
  label,
  version,
  nodeCount,
  edgeCount,
}: {
  label: string;
  version: number;
  nodeCount: number;
  edgeCount: number;
}): JSX.Element {
  const { t } = useLocalization();
  return (
    <div className="template-migration-version">
      <span>{label}</span>
      <strong>{t("templateMigration.version", { version })}</strong>
      <small>
        {t("templateMigration.topologyCount", { nodeCount, edgeCount })}
      </small>
    </div>
  );
}

function MigrationDiff({
  preview,
}: {
  preview: TemplateMigrationPreviewDto;
}): JSX.Element {
  const { t } = useLocalization();
  const { diff } = preview;
  const hasChanges =
    diff.addedNodes.length +
      diff.removedNodes.length +
      diff.updatedNodes.length +
      diff.reorderedNodes.length +
      diff.addedEdges.length +
      diff.removedEdges.length >
    0;

  if (!hasChanges) {
    return (
      <div className="template-migration-empty">
        <strong>{t("templateMigration.noChanges")}</strong>
      </div>
    );
  }

  return (
    <div className="template-migration-diff">
      <DiffSection
        title={t("templateMigration.addedNodes")}
        items={diff.addedNodes.map((node) => node.name)}
      />
      <DiffSection
        title={t("templateMigration.removedNodes")}
        items={diff.removedNodes.map((node) => node.name)}
        tone="removed"
      />
      <DiffSection
        title={t("templateMigration.updatedNodes")}
        items={diff.updatedNodes.map((node) =>
          updatedNodeLabel(node, t),
        )}
      />
      <DiffSection
        title={t("templateMigration.reorderedNodes")}
        items={diff.reorderedNodes.map((node) =>
          t("templateMigration.reorderedNode", {
            name:
              diff.targetWorkflow.nodes.find((item) => item.id === node.id)
                ?.name ?? node.id,
            from: node.from + 1,
            to: node.to + 1,
          }),
        )}
      />
      <DiffSection
        title={t("templateMigration.edgeChanges")}
        items={[
          ...diff.addedEdges.map((edge) =>
            t("templateMigration.addedEdge", { edge }),
          ),
          ...diff.removedEdges.map((edge) =>
            t("templateMigration.removedEdge", { edge }),
          ),
        ]}
      />
    </div>
  );
}

function DiffSection({
  title,
  items,
  tone = "default",
}: {
  title: string;
  items: string[];
  tone?: "default" | "removed";
}): JSX.Element | null {
  if (items.length === 0) return null;
  return (
    <section className={`template-migration-diff-section ${tone}`}>
      <h3>{title}</h3>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function updatedNodeLabel(
  node: TemplateMigrationUpdatedNode,
  t: ReturnType<typeof useLocalization>["t"],
): string {
  const fields = node.changedFields.map((field) =>
    t(TEMPLATE_MIGRATION_FIELD_KEYS[field]),
  );
  return `${node.sourceName} → ${node.targetName} · ${fields.join("、")}`;
}

const TEMPLATE_MIGRATION_FIELD_KEYS: Record<
  TemplateMigrationChangedField,
  TranslationKey
> = {
  name: "templateMigration.field.name",
  description: "templateMigration.field.description",
  type: "templateMigration.field.type",
  allowSkip: "templateMigration.field.allowSkip",
  configuration: "templateMigration.field.configuration",
  executor: "templateMigration.field.executor",
  completionGate: "templateMigration.field.completionGate",
};

function isRevisionConflict(cause: unknown): boolean {
  if (
    cause &&
    typeof cause === "object" &&
    "code" in cause &&
    cause.code === "revision_conflict"
  ) {
    return true;
  }
  const message = errorMessage(cause, "").toLowerCase();
  return message.includes("stale") || message.includes("revision conflict");
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

function createRequestId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `migration-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}
