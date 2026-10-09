import { Download, Play, RefreshCw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  RuntimeEvaluation,
  RuntimeGovernanceApi,
  RuntimeGovernanceSnapshot,
  RuntimeRunDetail,
} from "../../../shared/runtime-governance";
import { DataTable, InlineAlert, Metric } from "../../components/ui";
import { useLocalization } from "../../localization/LocalizationProvider";

export default function RuntimeGovernancePanel({
  api,
}: {
  api?: RuntimeGovernanceApi;
}): JSX.Element {
  const { t } = useLocalization();
  const requestId = useRef(0);
  const detailRequestId = useRef(0);
  const [snapshot, setSnapshot] = useState<RuntimeGovernanceSnapshot | null>(
    null,
  );
  const [detail, setDetail] = useState<RuntimeRunDetail | null>(null);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionStatus, setActionStatus] = useState("");
  const [actionPending, setActionPending] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => {
    const currentRequest = ++requestId.current;
    if (!api) {
      setLoading(false);
      setError(t("runtimeGovernance.unavailable"));
      return;
    }
    setLoading(true);
    setError("");
    void api
      .getSnapshot()
      .then((value) => {
        if (currentRequest !== requestId.current) return;
        setSnapshot(value);
      })
      .catch(() => {
        if (currentRequest !== requestId.current) return;
        setSnapshot(null);
        setError(t("runtimeGovernance.loadFailed"));
      })
      .finally(() => {
        if (currentRequest === requestId.current) setLoading(false);
      });
  }, [api, retryVersion, t]);

  const selectRun = useCallback(
    (runId: string) => {
      if (!api) return;
      const currentRequest = ++detailRequestId.current;
      setSelectedRunId(runId);
      setDetail(null);
      setActionStatus("");
      void api
        .getRunDetail(runId)
        .then((value) => {
          if (currentRequest === detailRequestId.current) setDetail(value);
        })
        .catch(() => {
          if (currentRequest === detailRequestId.current) {
            setActionStatus(t("runtimeGovernance.loadFailed"));
          }
        });
    },
    [api, t],
  );

  const runEvaluation = useCallback(async () => {
    if (!api || actionPending) return;
    setActionPending(true);
    setActionStatus("");
    try {
      await api.runEvaluation();
      setRetryVersion((value) => value + 1);
    } catch {
      setActionStatus(t("runtimeGovernance.loadFailed"));
    } finally {
      setActionPending(false);
    }
  }, [actionPending, api, t]);

  const release = useCallback(
    async (evaluation: RuntimeEvaluation) => {
      if (!api || !snapshot || actionPending) return;
      setActionPending(true);
      setActionStatus("");
      try {
        const result = await api.release({
          evaluationId: evaluation.id,
          expectedRevision: snapshot.revision,
        });
        setActionStatus(
          result.status === "published"
            ? t("runtimeGovernance.released", {
                revision: result.revision,
              })
            : t("runtimeGovernance.blocked", {
                reasons: result.reasons.join(", "),
              }),
        );
        if (result.status === "published") {
          setSnapshot((current) =>
            current ? { ...current, revision: result.revision } : current,
          );
        }
      } catch {
        setActionStatus(t("runtimeGovernance.loadFailed"));
      } finally {
        setActionPending(false);
      }
    },
    [actionPending, api, snapshot, t],
  );

  const exportDiagnostic = useCallback(async () => {
    if (!api || !selectedRunId || actionPending) return;
    setActionPending(true);
    setActionStatus("");
    try {
      const result = await api.exportDiagnostic(selectedRunId);
      if (result.status === "exported") {
        setActionStatus(
          t("runtimeGovernance.exported", { fileName: result.fileName }),
        );
      }
    } catch {
      setActionStatus(t("runtimeGovernance.loadFailed"));
    } finally {
      setActionPending(false);
    }
  }, [actionPending, api, selectedRunId, t]);

  if (error) {
    return (
      <InlineAlert
        className="model-page-error analytics-error"
        tone="danger"
        title={error}
        actionLabel={api ? t("common.retry") : undefined}
        onAction={api ? () => setRetryVersion((value) => value + 1) : undefined}
      />
    );
  }
  if (loading || !snapshot) {
    return <p className="model-empty">{t("runtimeGovernance.loading")}</p>;
  }

  return (
    <div className="runtime-governance-panel">
      <GovernanceSummary snapshot={snapshot} />

      <div className="runtime-governance-workspace">
        <section
          className="runtime-governance-failures"
          aria-labelledby="runtime-governance-failures-title"
        >
          <header>
            <div>
              <span>{snapshot.failedRuns.length}</span>
              <h2 id="runtime-governance-failures-title">
                {t("runtimeGovernance.failedHeading")}
              </h2>
            </div>
          </header>
          {snapshot.failedRuns.length === 0 ? (
            <p>{t("runtimeGovernance.noFailures")}</p>
          ) : (
            <ul>
              {snapshot.failedRuns.map((run) => (
                <li key={run.runId}>
                  <button
                    type="button"
                    aria-pressed={selectedRunId === run.runId}
                    onClick={() => selectRun(run.runId)}
                  >
                    <span>{run.runId}</span>
                    <strong>{run.errorCode}</strong>
                    <small>
                      {run.stage} · {run.scenarioId}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <RunDebugDetail
          detail={detail}
          selectedRunId={selectedRunId}
          pending={actionPending}
          onExport={exportDiagnostic}
        />
      </div>

      {actionStatus ? <p role="status">{actionStatus}</p> : null}

      <EvaluationSection
        snapshot={snapshot}
        pending={actionPending}
        onEvaluate={runEvaluation}
        onRelease={release}
      />
      <CapabilityGovernance snapshot={snapshot} />
    </div>
  );
}

function GovernanceSummary({
  snapshot,
}: {
  snapshot: RuntimeGovernanceSnapshot;
}): JSX.Element {
  const { t } = useLocalization();
  const values = [
    [t("runtimeGovernance.totalRuns"), snapshot.summary.totalRuns],
    [t("runtimeGovernance.completedRuns"), snapshot.summary.completedRuns],
    [t("runtimeGovernance.failedRuns"), snapshot.summary.failedRuns],
    [
      t("runtimeGovernance.recoveryRate"),
      `${formatNumber(snapshot.summary.recoveryRate)}%`,
    ],
    [t("runtimeGovernance.permissionWaits"), snapshot.summary.permissionWaits],
  ];
  return (
    <section
      className="runtime-governance-summary"
      role="region"
      aria-label={t("runtimeGovernance.overview")}
    >
      {values.map(([label, value]) => (
        <Metric key={label} label={label} value={value} />
      ))}
    </section>
  );
}

function RunDebugDetail({
  detail,
  selectedRunId,
  pending,
  onExport,
}: {
  detail: RuntimeRunDetail | null;
  selectedRunId: string;
  pending: boolean;
  onExport: () => void;
}): JSX.Element {
  const { t } = useLocalization();
  return (
    <section
      className="runtime-governance-detail"
      role="region"
      aria-label={t("runtimeGovernance.detail")}
    >
      <header>
        <div>
          <span>{selectedRunId || "RUN"}</span>
          <h2>{t("runtimeGovernance.detail")}</h2>
        </div>
        {detail ? (
          <button type="button" disabled={pending} onClick={onExport}>
            <Download size={14} aria-hidden="true" />
            {t("runtimeGovernance.export")}
          </button>
        ) : null}
      </header>
      {!detail ? (
        <p>{t("runtimeGovernance.selectRun")}</p>
      ) : (
        <>
          <div className="runtime-governance-config">
            <h3>{t("runtimeGovernance.configuration")}</h3>
            <dl>
              <div>
                <dt>Profile</dt>
                <dd>{detail.configuration.profile}</dd>
              </div>
              <div>
                <dt>Pipeline</dt>
                <dd>{detail.configuration.pipelineVersion}</dd>
              </div>
              <div>
                <dt>Error</dt>
                <dd>{detail.errorCode}</dd>
              </div>
              <div>
                <dt>Prompt</dt>
                <dd>{shortDigest(detail.configuration.promptDigest)}</dd>
              </div>
            </dl>
          </div>
          <div className="runtime-governance-trace">
            <h3>{t("runtimeGovernance.trace")}</h3>
            <ol>
              {detail.trace.map((event) => (
                <li key={event.eventId}>
                  <span>{event.sequence}</span>
                  <div>
                    <strong>{event.type}</strong>
                    <small>{event.summary}</small>
                  </div>
                  <code>{event.stage}</code>
                </li>
              ))}
            </ol>
          </div>
        </>
      )}
    </section>
  );
}

function EvaluationSection({
  snapshot,
  pending,
  onEvaluate,
  onRelease,
}: {
  snapshot: RuntimeGovernanceSnapshot;
  pending: boolean;
  onEvaluate: () => void;
  onRelease: (evaluation: RuntimeEvaluation) => void;
}): JSX.Element {
  const { t } = useLocalization();
  return (
    <section className="runtime-governance-section">
      <header>
        <div>
          <span>REV {snapshot.revision}</span>
          <h2>{t("runtimeGovernance.evaluations")}</h2>
        </div>
        <button type="button" disabled={pending} onClick={onEvaluate}>
          <Play size={14} aria-hidden="true" />
          {t("runtimeGovernance.evaluate")}
        </button>
      </header>
      {snapshot.evaluations.length === 0 ? (
        <p>{t("runtimeGovernance.noEvaluations")}</p>
      ) : (
        <DataTable
          caption={t("runtimeGovernance.evaluations")}
          density="compact"
          scrollClassName="runtime-governance-table-wrap"
        >
          <thead>
            <tr>
              <th>{t("runtimeGovernance.column.candidate")}</th>
              <th>{t("runtimeGovernance.column.score")}</th>
              <th>{t("runtimeGovernance.column.safety")}</th>
              <th aria-label={t("runtimeGovernance.release")} />
            </tr>
          </thead>
          <tbody>
            {snapshot.evaluations.map((evaluation) => (
              <tr key={evaluation.id}>
                <th scope="row">
                  <strong>{evaluation.id}</strong>
                  <small>{shortDigest(evaluation.candidateDigest)}</small>
                </th>
                <td>{formatNumber(evaluation.scores.overall)}</td>
                <td>{formatNumber(evaluation.scores.safety)}</td>
                <td>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => onRelease(evaluation)}
                  >
                    <ShieldCheck size={14} aria-hidden="true" />
                    {t("runtimeGovernance.release")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </section>
  );
}

function CapabilityGovernance({
  snapshot,
}: {
  snapshot: RuntimeGovernanceSnapshot;
}): JSX.Element {
  const { locale, t } = useLocalization();
  return (
    <section className="runtime-governance-section">
      <header>
        <div>
          <span>
            {t("runtimeGovernance.retention", {
              days: snapshot.observability.retentionDays,
            })}
          </span>
          <h2>{t("runtimeGovernance.capabilities")}</h2>
        </div>
        <div className="runtime-governance-capacity">
          <span>{t("runtimeGovernance.eventCapacity")}</span>
          <strong>
            {snapshot.observability.storedEvents.toLocaleString(locale)} /{" "}
            {snapshot.observability.maximumEvents.toLocaleString(locale)}
          </strong>
          <small>
            {t("runtimeGovernance.droppedEvents", {
              count: snapshot.observability.droppedEvents,
            })}
          </small>
        </div>
      </header>
      <DataTable
        caption={t("runtimeGovernance.capabilities")}
        density="compact"
        scrollClassName="runtime-governance-table-wrap"
      >
        <thead>
          <tr>
            <th>{t("runtimeGovernance.column.capability")}</th>
            <th>{t("runtimeGovernance.column.version")}</th>
            <th>{t("runtimeGovernance.column.scope")}</th>
            <th>{t("runtimeGovernance.column.source")}</th>
            <th>{t("runtimeGovernance.column.status")}</th>
          </tr>
        </thead>
        <tbody>
          {snapshot.capabilities.map((capability) => (
            <tr
              key={`${capability.capabilityId}@${capability.capabilityVersion}`}
            >
              <th scope="row">
                <strong>{capability.capabilityId}</strong>
                <small>
                  {capability.conversationId ??
                    capability.generationSessionId ??
                    capability.kind}
                </small>
              </th>
              <td>{capability.capabilityVersion}</td>
              <td>{capability.scopeLabel}</td>
              <td>{capability.source}</td>
              <td>
                {capability.enabled
                  ? t("runtimeGovernance.enabled")
                  : t("runtimeGovernance.disabled")}
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </section>
  );
}

function shortDigest(value: string): string {
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
