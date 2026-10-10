import {
  AlertTriangle,
  Box,
  FileArchive,
  FolderUp,
  Sparkles,
  Wrench,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import type {
  ToolCatalogActivationCommand,
  ChangeExtensionPackageVersionCommand,
  ToolCatalogDto,
  ToolCatalogPackageDto,
  ToolCatalogSkillDto,
  ToolCatalogSourceType,
  ToolCatalogTargetType,
  ToolCatalogToolDto,
} from "../../../shared/tool-catalog";
import {
  Badge,
  EmptyState,
  ListPagination,
  Toolbar,
  useListPagination,
} from "../../components/ui";
import { useLocalization } from "../../localization/LocalizationProvider";
import {
  createEnumQueryCodec,
  useUrlQueryState,
} from "../../navigation/url-query-state";
import { pluginPackageDetails } from "./plugin-package-display";

type CatalogOriginFilter = "all" | "builtin" | "local_upload" | "mcp";
type ToolCatalogView = "primitive" | "model-facing" | "directory";
const catalogOriginCodec = createEnumQueryCodec(
  ["all", "builtin", "local_upload", "mcp"] as const,
  "all",
);

type ToolCatalogPanelProps = {
  activeTab: "tools" | "skills";
  catalog: ToolCatalogDto;
  catalogView: ToolCatalogView;
  loading: boolean;
  busyTarget?: string;
  importing?: ToolCatalogSourceType;
  onCatalogViewChange: (view: ToolCatalogView) => void;
  onToggle: (command: ToolCatalogActivationCommand) => void;
  onChangePackageVersion: (
    command: ChangeExtensionPackageVersionCommand,
  ) => void;
  onImport: (sourceType: ToolCatalogSourceType) => void;
};

export function ToolCatalogPanel({
  activeTab,
  catalog,
  catalogView,
  loading,
  busyTarget,
  importing,
  onCatalogViewChange,
  onToggle,
  onChangePackageVersion,
  onImport,
}: ToolCatalogPanelProps): JSX.Element {
  const { locale, t } = useLocalization();
  const collator = useMemo(() => new Intl.Collator(locale), [locale]);
  const [origin, setOrigin] = useUrlQueryState<CatalogOriginFilter>(
    "origin",
    catalogOriginCodec,
  );
  const packages = useMemo(
    () =>
      latestPackages(catalog.packages)
        .filter((item) =>
          origin === "all" ? true : item.origin === origin,
        )
        .sort((left, right) =>
          collator.compare(
            left.display?.name ?? left.name,
            right.display?.name ?? right.name,
          ),
        ),
    [catalog.packages, collator, origin],
  );
  const items = useMemo(() => {
    const definitions =
      activeTab === "tools"
        ? latestDefinitions(catalog.tools)
        : latestDefinitions(
            catalog.skills.filter((item) => !item.registry),
          );
    return definitions
      .filter((item) =>
        origin === "all" ? true : item.definition.origin === origin,
      )
      .sort((left, right) => compareCatalogItems(left, right, collator));
  }, [activeTab, catalog.skills, catalog.tools, collator, origin]);
  const packagePagination = useListPagination(packages);
  const itemPagination = useListPagination(items);

  useEffect(() => {
    packagePagination.resetPage();
    itemPagination.resetPage();
  }, [activeTab, origin]);

  return (
    <div className="tool-catalog">
      <Toolbar
        className="tool-catalog-toolbar"
        aria-label={t("capabilities.filter.aria")}
      >
        {activeTab === "tools" ? (
          <div
            className="tool-catalog-origin-filter tool-catalog-view-switch"
            role="group"
            aria-label={t("capabilities.catalogView.aria")}
          >
            <button
              type="button"
              aria-pressed={catalogView === "primitive"}
              onClick={() => onCatalogViewChange("primitive")}
            >
              {t("capabilities.catalogView.primitive")}
            </button>
            <button
              type="button"
              aria-pressed={catalogView === "model-facing"}
              onClick={() => onCatalogViewChange("model-facing")}
            >
              {t("capabilities.catalogView.modelFacing")}
            </button>
            <button
              type="button"
              aria-pressed={catalogView === "directory"}
              onClick={() => onCatalogViewChange("directory")}
            >
              {t("capabilities.catalogView.directoryOnly")}
            </button>
          </div>
        ) : null}
        <div
          className="tool-catalog-origin-filter"
          role="group"
          aria-label={t("capabilities.filter.aria")}
        >
          {(["all", "builtin", "local_upload", "mcp"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={origin === value}
              onClick={() => setOrigin(value)}
            >
              {originLabel(value, t)}
            </button>
          ))}
        </div>
        <div className="tool-catalog-import-actions">
          <button
            type="button"
            disabled={Boolean(importing)}
            onClick={() => onImport("directory")}
          >
            <FolderUp size={15} />
            {importing === "directory"
              ? t("capabilities.importing")
              : t("capabilities.importDirectory")}
          </button>
          <button
            type="button"
            disabled={Boolean(importing)}
            onClick={() => onImport("archive")}
          >
            <FileArchive size={15} />
            {importing === "archive"
              ? t("capabilities.importing")
              : t("capabilities.importArchive")}
          </button>
        </div>
      </Toolbar>

      <CatalogSection
        title={t("capabilities.packages")}
        count={packages.length}
        loading={loading}
        emptyLabel={t("capabilities.packages.empty")}
      >
        <Fragment>
          {packagePagination.pageItems.map((item) => (
            <CatalogRow
              key={`${item.packageId}@${item.version}`}
              icon={<Box size={17} />}
              name={item.display?.name ?? item.name}
              description={item.display?.description ?? item.description}
              origin={item.origin}
              version={item.version}
              status={item.status}
              enabled={item.enabledPreference}
              busy={busyTarget === targetKey("package", item.packageId)}
              details={item.packageId}
              extraDetails={pluginPackageDetails(item, t)}
              dependencyIssues={item.dependencyIssues}
              versionOptions={catalog.packages
                .filter(
                  (candidate) => candidate.packageId === item.packageId,
                )
                .map(({ version }) => version)}
              onChangeVersion={(targetVersion, operation) =>
                onChangePackageVersion({
                  packageId: item.packageId,
                  targetVersion,
                  operation,
                  idempotencyKey: requestId(
                    `package-${operation}`,
                  ),
                })
              }
              toggleLabel={
                item.plugin && !item.enabledPreference
                  ? t("capabilities.plugin.reviewAndEnable", {
                      name: item.display?.name ?? item.name,
                    })
                  : undefined
              }
              onToggle={() =>
                onToggle({
                  targetType: "package",
                  targetId: item.packageId,
                  enabled: !item.enabledPreference,
                  idempotencyKey: requestId("package-activation"),
                })
              }
            />
          ))}
          <ListPagination
            total={packages.length}
            page={packagePagination.page}
            pageSize={packagePagination.pageSize}
            onPageChange={packagePagination.setPage}
          />
        </Fragment>
      </CatalogSection>

      <CatalogSection
        title={
          activeTab === "tools"
            ? t("capabilities.tools")
            : t("capabilities.skills")
        }
        count={items.length}
        loading={loading}
        emptyLabel={
          activeTab === "tools"
            ? t("capabilities.tools.empty")
            : t("capabilities.skills.empty")
        }
      >
        <Fragment>
        {itemPagination.pageItems.map((item) =>
          item.kind === "tool" ? (
            <DefinitionRow
              key={`${item.id}@${item.version}`}
              item={item}
              icon={<Wrench size={17} />}
              details={toolDetails(item, t)}
              extraDetails={toolExtraDetails(item, t)}
              busy={busyTarget === targetKey("tool", item.id)}
              onToggle={onToggle}
            />
          ) : (
            <DefinitionRow
              key={`${item.id}@${item.version}`}
              item={item}
              icon={<Sparkles size={17} />}
              details={
                item.dependencyIssues.length > 0
                  ? t("capabilities.dependencies.missing", {
                      count: item.dependencyIssues.length,
                    })
                  : t("capabilities.dependencies.ready")
              }
              busy={busyTarget === targetKey("skill", item.id)}
              onToggle={onToggle}
            />
          ),
        )}
          <ListPagination
            total={items.length}
            page={itemPagination.page}
            pageSize={itemPagination.pageSize}
            onPageChange={itemPagination.setPage}
          />
        </Fragment>
      </CatalogSection>
    </div>
  );
}

function CatalogSection({
  title,
  count,
  loading,
  emptyLabel,
  children,
}: {
  title: string;
  count: number;
  loading: boolean;
  emptyLabel: string;
  children: React.ReactNode;
}): JSX.Element {
  const { t } = useLocalization();
  return (
    <section className="tool-catalog-section">
      <header>
        <h2>{title}</h2>
        <span>{count}</span>
      </header>
      <div className="tool-catalog-list">
        {loading ? (
          <p className="tool-catalog-empty">{t("common.loading")}</p>
        ) : count === 0 ? (
          <EmptyState className="tool-catalog-empty" title={emptyLabel} />
        ) : (
          children
        )}
      </div>
    </section>
  );
}

function DefinitionRow({
  item,
  icon,
  details,
  extraDetails = [],
  busy,
  onToggle,
}: {
  item: ToolCatalogToolDto | ToolCatalogSkillDto;
  icon: React.ReactNode;
  details: string;
  extraDetails?: string[];
  busy: boolean;
  onToggle: ToolCatalogPanelProps["onToggle"];
}): JSX.Element {
  const isFacade =
    item.kind === "tool" && item.modelFacing?.kind === "facade";
  return (
    <CatalogRow
      icon={icon}
      name={item.display?.name ?? item.definition.name}
      description={item.display?.description ?? item.definition.description}
      origin={item.definition.origin}
      version={item.version}
      status={item.status}
      enabled={item.enabledPreference}
      busy={busy}
      details={details}
      extraDetails={extraDetails}
      dependencyIssues={item.dependencyIssues}
      onToggle={
        isFacade
          ? undefined
          : () =>
              onToggle({
                targetType: item.kind,
                targetId: item.id,
                enabled: !item.enabledPreference,
                idempotencyKey: requestId(`${item.kind}-activation`),
              })
      }
    />
  );
}

function CatalogRow({
  icon,
  name,
  description,
  origin,
  version,
  status,
  enabled,
  busy,
  details,
  extraDetails = [],
  dependencyIssues = [],
  toggleLabel,
  versionOptions = [],
  onChangeVersion,
  onToggle,
}: {
  icon: React.ReactNode;
  name: string;
  description: string;
  origin: ToolCatalogPackageDto["origin"];
  version: string;
  status: string;
  enabled: boolean;
  busy: boolean;
  details: string;
  extraDetails?: string[];
  dependencyIssues?: string[];
  toggleLabel?: string;
  versionOptions?: string[];
  onChangeVersion?: (
    targetVersion: string,
    operation: "upgrade" | "rollback",
  ) => void;
  onToggle?: () => void;
}): JSX.Element {
  const { t } = useLocalization();
  const [targetVersion, setTargetVersion] = useState(version);
  useEffect(() => setTargetVersion(version), [version]);
  const operation =
    compareVersions(targetVersion, version) > 0
      ? "upgrade"
      : "rollback";
  return (
    <div className="tool-catalog-row">
      <div className="tool-catalog-icon">{icon}</div>
      <div className="tool-catalog-copy">
        <div className="tool-catalog-name-line">
          <strong>{name}</strong>
          <Badge
            className={`tool-catalog-status status-${status}`}
            tone={statusTone(status)}
          >
            {status === "corrupted" || status === "dependency_disabled" ? (
              <AlertTriangle size={12} />
            ) : null}
            {statusLabel(status, t)}
          </Badge>
        </div>
        <p>{description}</p>
        <div className="tool-catalog-meta">
          <span>{originLabel(origin, t)}</span>
          <span>v{version}</span>
          <span>{details}</span>
          {extraDetails.map((detail) => (
            <span key={detail}>{detail}</span>
          ))}
          {dependencyIssues.map((issue) => (
            <span key={issue}>{issue}</span>
          ))}
        </div>
      </div>
      {onToggle || (versionOptions.length > 1 && onChangeVersion) ? (
        <div className="tool-catalog-row-actions">
          {versionOptions.length > 1 && onChangeVersion ? (
            <div className="capability-version-control">
              <select
                name={`extension-package-${name}-version`}
                autoComplete="off"
                aria-label={t("capabilities.version.label", { name })}
                value={targetVersion}
                disabled={busy}
                onChange={(event) => setTargetVersion(event.target.value)}
              >
                {[...versionOptions]
                  .sort((left, right) =>
                    compareVersions(right, left),
                  )
                  .map((candidate) => (
                    <option key={candidate} value={candidate}>
                      v{candidate}
                    </option>
                  ))}
              </select>
              {targetVersion !== version ? (
                <button
                  type="button"
                  disabled={busy}
                  aria-label={t(`capabilities.${operation}`, { name })}
                  onClick={() =>
                    onChangeVersion(targetVersion, operation)
                  }
                >
                  {t(`capabilities.${operation}.short`)}
                </button>
              ) : null}
            </div>
          ) : null}
          {onToggle ? (
        <button
          className="model-provider-switch"
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={
            toggleLabel ??
            t("capabilities.toggle", {
              action: enabled ? t("common.disable") : t("common.enable"),
              name,
            })
          }
          disabled={busy || status === "corrupted"}
          onClick={onToggle}
        >
          <span />
        </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function toolDetails(
  item: ToolCatalogToolDto,
  t: ReturnType<typeof useLocalization>["t"],
): string {
  if (item.modelFacing?.kind === "facade") {
    return t("capabilities.catalogView.coverage", {
      count: item.modelFacing.coveredPrimitiveToolIds.length,
    });
  }
  if (item.modelFacing?.kind === "primitive") {
    return visibilityLabel(item.modelFacing.visibility, t);
  }
  return item.definition.capabilities.join(" · ");
}

function toolExtraDetails(
  item: ToolCatalogToolDto,
  t: ReturnType<typeof useLocalization>["t"],
): string[] {
  if (item.modelFacing?.kind === "facade") {
    return [
      t("capabilities.catalogView.maxRisk", {
        risk: item.modelFacing.maxRisk,
      }),
    ];
  }
  if (item.modelFacing?.kind === "primitive" && item.modelFacing.facadeId) {
    return [
      t("capabilities.catalogView.facadeBackedBy", {
        facadeId: item.modelFacing.facadeId,
      }),
    ];
  }
  return [];
}

function visibilityLabel(
  visibility: NonNullable<ToolCatalogToolDto["modelFacing"]>["visibility"],
  t: ReturnType<typeof useLocalization>["t"],
): string {
  if (visibility === "direct") return t("capabilities.catalogView.direct");
  if (visibility === "facade_backed") {
    return t("capabilities.catalogView.facadeBacked");
  }
  if (visibility === "directory_only") {
    return t("capabilities.catalogView.directoryOnly");
  }
  return t("capabilities.catalogView.hidden");
}

function statusTone(
  status: string,
): "neutral" | "success" | "warning" | "danger" {
  if (status === "enabled" || status === "active") return "success";
  if (status === "corrupted" || status === "dependency_disabled") {
    return "danger";
  }
  if (status === "disabled") return "neutral";
  return "warning";
}

function latestPackages(
  items: ToolCatalogPackageDto[],
): ToolCatalogPackageDto[] {
  return latestById(items, (item) => item.packageId);
}

function latestDefinitions<T extends ToolCatalogToolDto | ToolCatalogSkillDto>(
  items: T[],
): T[] {
  return latestById(items, (item) => item.id);
}

function compareCatalogItems<T extends ToolCatalogToolDto | ToolCatalogSkillDto>(
  left: T,
  right: T,
  collator: Intl.Collator,
): number {
  const priority = modelFacingSortPriority(left) - modelFacingSortPriority(right);
  if (priority !== 0) return priority;
  return collator.compare(
    left.display?.name ?? left.definition.name,
    right.display?.name ?? right.definition.name,
  );
}

function modelFacingSortPriority(
  item: ToolCatalogToolDto | ToolCatalogSkillDto,
): number {
  if (item.kind !== "tool" || !item.modelFacing) return 1;
  if (item.modelFacing.kind === "facade") return 0;
  if (item.modelFacing.visibility === "direct") return 1;
  if (item.modelFacing.visibility === "facade_backed") return 2;
  if (item.modelFacing.visibility === "directory_only") return 3;
  return 4;
}

function latestById<T extends { version: string }>(
  items: T[],
  getId: (item: T) => string,
): T[] {
  const latest = new Map<string, T>();
  for (const item of items) {
    const current = latest.get(getId(item));
    if (!current || compareVersions(item.version, current.version) > 0) {
      latest.set(getId(item), item);
    }
  }
  return [...latest.values()].sort((left, right) =>
    getId(left).localeCompare(getId(right)),
  );
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

function targetKey(type: ToolCatalogTargetType, id: string): string {
  return `${type}:${id}`;
}

function requestId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function originLabel(
  origin: CatalogOriginFilter,
  t: ReturnType<typeof useLocalization>["t"],
): string {
  if (origin === "all") return t("capabilities.filter.all");
  if (origin === "builtin") return t("capabilities.origin.builtin");
  if (origin === "local_upload") return t("capabilities.origin.local");
  return t("capabilities.origin.mcp");
}

function statusLabel(
  status: string,
  t: ReturnType<typeof useLocalization>["t"],
): string {
  if (status === "enabled") return t("capabilities.status.enabled");
  if (status === "disabled") return t("capabilities.status.disabled");
  if (status === "dependency_disabled") {
    return t("capabilities.status.dependencyDisabled");
  }
  if (status === "superseded") {
    return t("capabilities.status.superseded");
  }
  return t("capabilities.status.corrupted");
}
