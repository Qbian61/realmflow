import type { RequirementExecutionArtifactDto } from "../../../shared/business";
import { useLocalization } from "../../localization/LocalizationProvider";

export type NodeArtifactPanelLabels = {
  title: string;
  fileName: string;
  relativePath: string;
  type: string;
  version: string;
  size: string;
  updatedAt: string;
  empty: string;
  open: string;
};

type NodeArtifactPanelProps = {
  nodeName: string;
  artifacts: RequirementExecutionArtifactDto[];
  onOpenArtifact: (relativePath: string, label: string) => void;
  labels?: Partial<NodeArtifactPanelLabels>;
};

export function NodeArtifactPanel({
  nodeName,
  artifacts,
  onOpenArtifact,
  labels: labelOverrides,
}: NodeArtifactPanelProps): JSX.Element {
  const { locale, t } = useLocalization();
  const labels: NodeArtifactPanelLabels = {
    title: t("workflowExecution.artifacts"),
    fileName: t("resources.column.name"),
    relativePath: t("requirementDetail.path"),
    type: t("resources.column.type"),
    version: t("workflowInspector.version"),
    size: t("settings.backup.summary.size"),
    updatedAt: t("resources.column.updatedAt"),
    empty: t("workflowExecution.emptyArtifacts"),
    open: t("common.open"),
    ...labelOverrides,
  };

  return (
    <section
      className="node-artifact-panel"
      aria-label={`${nodeName} ${labels.title}`}
    >
      {artifacts.length === 0 ? (
        <p className="node-workbench-empty-state">{labels.empty}</p>
      ) : (
        <ul className="node-artifact-panel__list">
          {artifacts.map((artifact) => {
            const fileName = getFileName(artifact.relativePath);

            return (
              <li className="node-artifact-panel__item" key={artifact.id}>
                <button
                  type="button"
                  className="node-artifact-panel__open"
                  aria-label={`${labels.open} ${fileName}`}
                  onClick={() =>
                    onOpenArtifact(artifact.relativePath, fileName)
                  }
                >
                  <strong>{fileName}</strong>
                  <span
                    className="node-artifact-panel__path"
                    title={artifact.relativePath}
                  >
                    {artifact.relativePath}
                  </span>
                  <dl className="node-artifact-panel__metadata">
                    <div>
                      <dt>{labels.type}</dt>
                      <dd>{artifact.kind}</dd>
                    </div>
                    <div>
                      <dt>{labels.version}</dt>
                      <dd>{artifact.version}</dd>
                    </div>
                    <div>
                      <dt>{labels.size}</dt>
                      <dd>{formatBytes(artifact.byteSize, locale)}</dd>
                    </div>
                    <div>
                      <dt>{labels.updatedAt}</dt>
                      <dd>
                        <time
                          dateTime={new Date(artifact.updatedAt).toISOString()}
                        >
                          {new Date(artifact.updatedAt).toLocaleString(locale)}
                        </time>
                      </dd>
                    </div>
                  </dl>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function getFileName(relativePath: string): string {
  return relativePath.slice(relativePath.lastIndexOf("/") + 1);
}

function formatBytes(byteSize: number, locale: string): string {
  if (byteSize < 1_024) return `${byteSize.toLocaleString(locale)} B`;

  const units = ["KB", "MB", "GB", "TB"];
  let value = byteSize / 1_024;
  let unitIndex = 0;

  while (value >= 1_024 && unitIndex < units.length - 1) {
    value /= 1_024;
    unitIndex += 1;
  }

  return `${value.toLocaleString(locale, {
    maximumFractionDigits: value < 10 ? 1 : 0,
  })} ${units[unitIndex]}`;
}
