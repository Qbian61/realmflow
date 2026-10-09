import type {
  CapabilityDefinition,
  CapabilityInstallation,
} from "../../../domain/capability";
import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  Badge,
  IconButton,
  ListPagination,
  useListPagination,
} from "../../components/ui";
import { useLocalization } from "../../localization/LocalizationProvider";
import type { LocalizedCapabilityDisplay } from "../../../shared/capability-localization";

type InstalledCapabilityListProps = {
  kind: CapabilityDefinition["kind"];
  definitions: CapabilityDefinition[];
  installations: CapabilityInstallation[];
  displayByDefinitionKey?: Record<string, LocalizedCapabilityDisplay>;
  busyInstallationId?: string;
  onSetEnabled?: (
    installation: CapabilityInstallation,
    enabled: boolean,
  ) => void;
  onChangeVersion?: (
    installation: CapabilityInstallation,
    targetVersion: string,
    operation: "upgrade" | "rollback",
  ) => void;
  onDelete?: (installation: CapabilityInstallation) => void;
  getDetail?: (
    definition: CapabilityDefinition,
    installation: CapabilityInstallation,
  ) => string;
};

export function InstalledCapabilityList({
  kind,
  definitions,
  installations,
  displayByDefinitionKey,
  busyInstallationId,
  onSetEnabled,
  onChangeVersion,
  onDelete,
  getDetail,
}: InstalledCapabilityListProps): JSX.Element | null {
  const { t } = useLocalization();
  const items = installations.flatMap((installation) => {
    const definition = definitions.find(
      (candidate) =>
        candidate.kind === kind &&
        candidate.id === installation.capabilityId &&
        candidate.version === installation.capabilityVersion,
    );
    return definition
      ? [
          {
            definition,
            installation,
            versions: definitions.filter(
              (candidate) =>
                candidate.kind === kind &&
                candidate.id === installation.capabilityId,
            ),
            display:
              displayByDefinitionKey?.[
                `${definition.id}@${definition.version}`
              ],
          },
        ]
      : [];
  });
  const pagination = useListPagination(items);

  if (items.length === 0) {
    return null;
  }

  return (
    <section
      className="installed-capability-list"
      aria-label={t("capabilities.installed")}
    >
      {pagination.pageItems.map(
        ({ definition, installation, versions, display }) => (
        <InstalledCapabilityRow
          key={installation.id}
          definition={definition}
          installation={installation}
          versions={versions}
          busy={busyInstallationId === installation.id}
          onSetEnabled={onSetEnabled}
          onChangeVersion={onChangeVersion}
          onDelete={onDelete}
          detail={getDetail?.(definition, installation)}
          display={display}
        />
        )
      )}
      <ListPagination
        total={items.length}
        page={pagination.page}
        pageSize={pagination.pageSize}
        onPageChange={pagination.setPage}
      />
    </section>
  );
}

function InstalledCapabilityRow({
  definition,
  installation,
  versions,
  busy,
  onSetEnabled,
  onChangeVersion,
  onDelete,
  detail,
  display,
}: {
  definition: CapabilityDefinition;
  installation: CapabilityInstallation;
  versions: CapabilityDefinition[];
  busy: boolean;
  onSetEnabled?: InstalledCapabilityListProps["onSetEnabled"];
  onChangeVersion?: InstalledCapabilityListProps["onChangeVersion"];
  onDelete?: InstalledCapabilityListProps["onDelete"];
  detail?: string;
  display?: LocalizedCapabilityDisplay;
}): JSX.Element {
  const { t } = useLocalization();
  const [targetVersion, setTargetVersion] = useState(
    installation.capabilityVersion,
  );
  useEffect(() => {
    setTargetVersion(installation.capabilityVersion);
  }, [installation.capabilityVersion]);
  const operation =
    compareVersions(targetVersion, installation.capabilityVersion) > 0
      ? "upgrade"
      : "rollback";

  return (
    <article>
      <div>
        <strong>{display?.name ?? definition.name}</strong>
        <p>{detail ?? display?.description ?? definition.description}</p>
      </div>
      <span>{scopeLabel(installation)}</span>
      <div className="capability-version-control">
        <select name={`capability-${definition.id}-version`} autoComplete="off"
          aria-label={t("capabilities.version.label", {
            name: display?.name ?? definition.name,
          })}
          value={targetVersion}
          disabled={busy}
          onChange={(event) => setTargetVersion(event.target.value)}
        >
          {[...versions]
            .sort((left, right) => compareVersions(right.version, left.version))
            .map((version) => (
              <option key={version.version} value={version.version}>
                v{version.version}
              </option>
            ))}
        </select>
        {targetVersion !== installation.capabilityVersion && onChangeVersion ? (
          <button
            type="button"
            disabled={busy}
            aria-label={t(`capabilities.${operation}`, {
              name: display?.name ?? definition.name,
            })}
            onClick={() =>
              onChangeVersion(installation, targetVersion, operation)
            }
          >
            {t(`capabilities.${operation}.short`)}
          </button>
        ) : null}
      </div>
      <Badge
        tone={installation.enabled ? "success" : "neutral"}
        className={
          installation.enabled
            ? "capability-status-enabled"
            : "capability-status-disabled"
        }
      >
        {installation.enabled
          ? t("capabilities.status.enabled")
          : t("capabilities.status.disabled")}
      </Badge>
      <button
        className="model-provider-switch"
        type="button"
        role="switch"
        aria-checked={installation.enabled}
        aria-label={t("capabilities.toggle", {
          action: installation.enabled
            ? t("common.disable")
            : t("common.enable"),
          name: display?.name ?? definition.name,
        })}
        disabled={busy || !onSetEnabled}
        onClick={() => onSetEnabled?.(installation, !installation.enabled)}
      >
        <span />
      </button>
      <IconButton
        className="capability-delete-button"
        size="compact"
        variant="ghost"
        title={t("capabilities.delete.short")}
        aria-label={t("capabilities.delete", {
          name: display?.name ?? definition.name,
        })}
        disabled={busy || !onDelete}
        onClick={() => onDelete?.(installation)}
      >
        <Trash2 size={14} aria-hidden="true" />
      </IconButton>
    </article>
  );
}

function scopeLabel(installation: CapabilityInstallation): string {
  if (installation.scope.kind === "global") return "Global";
  return installation.scope.kind;
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = leftParts[index] - rightParts[index];
    if (difference !== 0) return difference;
  }
  return 0;
}
