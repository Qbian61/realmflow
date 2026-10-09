import { useEffect } from "react";
import type { ConnectorDto, BusinessApi } from "../../../shared/business";
import type {
  McpServerDto,
  ToolCatalogApi,
} from "../../../shared/tool-catalog";
import type {
  CapabilityDefinition,
  CapabilityInstallation,
} from "../../../domain/capability";
import { EmptyState, Toolbar } from "../../components/ui";
import { useLocalization } from "../../localization/LocalizationProvider";
import {
  createEnumQueryCodec,
  useUrlQueryState,
} from "../../navigation/url-query-state";
import { ConnectorSettings } from "../settings/ConnectorSettings";
import { McpServerSettings } from "./McpServerSettings";
import { ConnectorCapabilityList } from "./ConnectorCapabilityList";
import type { LocalizedCapabilityDisplay } from "../../../shared/capability-localization";

export type ConnectorKindFilter = "all" | "mcp" | "http" | "database" | "cli";
const connectorKindCodec = createEnumQueryCodec(
  ["all", "mcp", "http", "database", "cli"] as const,
  "all",
);

type ConnectorCatalogPanelProps = {
  business: BusinessApi;
  toolCatalog: ToolCatalogApi;
  connectors: ConnectorDto[];
  mcpServers: McpServerDto[];
  loading: boolean;
  manualRequest: number;
  onConnectorsChange: (connectors: ConnectorDto[]) => void;
  onMcpServersChange: (servers: McpServerDto[]) => void;
  onCatalogChange: () => Promise<void>;
  onError: (message: string) => void;
  definitions: CapabilityDefinition[];
  installations: CapabilityInstallation[];
  displayByDefinitionKey?: Record<string, LocalizedCapabilityDisplay>;
  busyInstallationId?: string;
  onSetEnabled: (
    installation: CapabilityInstallation,
    enabled: boolean,
  ) => void;
  onChangeVersion: (
    installation: CapabilityInstallation,
    targetVersion: string,
    operation: "upgrade" | "rollback",
  ) => void;
  onDelete: (installation: CapabilityInstallation) => void;
};

export function ConnectorCatalogPanel({
  business,
  toolCatalog,
  connectors,
  mcpServers,
  loading,
  manualRequest,
  onConnectorsChange,
  onMcpServersChange,
  onCatalogChange,
  onError,
  definitions,
  installations,
  displayByDefinitionKey,
  busyInstallationId,
  onSetEnabled,
  onChangeVersion,
  onDelete,
}: ConnectorCatalogPanelProps): JSX.Element {
  const { t } = useLocalization();
  const [filter, setFilter] = useUrlQueryState<ConnectorKindFilter>(
    "connectorKind",
    connectorKindCodec,
  );

  useEffect(() => {
    if (manualRequest > 0) setFilter("http", { replace: true });
  }, [manualRequest]);

  const showMcp = filter === "all" || filter === "mcp";
  const showHttp = filter === "all" || filter === "http";
  const hasInstalledPackage = definitions.some(
    (definition) =>
      definition.kind === "connector" &&
      definition.runtime.kind === "connector" &&
      (filter === "all" || definition.runtime.connectorKind === filter) &&
      installations.some(
        (installation) =>
          installation.capabilityId === definition.id &&
          installation.capabilityVersion === definition.version,
      ),
  );
  const emptyKind =
    (filter === "database" || filter === "cli") && !hasInstalledPackage;

  return (
    <div className="connector-catalog">
      <Toolbar
        className="connector-kind-filter"
        aria-label={t("capabilities.connectors.filterAria")}
      >
        {(["all", "mcp", "http", "database", "cli"] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            aria-pressed={filter === kind}
            onClick={() => setFilter(kind)}
          >
            {connectorKindLabel(kind, t)}
          </button>
        ))}
      </Toolbar>

      <ConnectorCapabilityList
        filter={filter}
        definitions={definitions}
        installations={installations}
        displayByDefinitionKey={displayByDefinitionKey}
        busyInstallationId={busyInstallationId}
        onSetEnabled={onSetEnabled}
        onChangeVersion={onChangeVersion}
        onDelete={onDelete}
      />
      {showMcp ? (
        <McpServerSettings
          api={toolCatalog}
          servers={mcpServers}
          loading={loading}
          onChange={onMcpServersChange}
          onCatalogChange={onCatalogChange}
        />
      ) : null}
      {showHttp ? (
        <ConnectorSettings
          business={business}
          connectors={connectors}
          loading={loading}
          openCreateRequest={manualRequest}
          onChange={onConnectorsChange}
          onError={onError}
        />
      ) : null}
      {emptyKind ? (
        <EmptyState
          className="capabilities-agent-empty"
          title={t("capabilities.connectors.empty", {
            kind: connectorKindLabel(filter, t),
          })}
        />
      ) : null}
    </div>
  );
}

function connectorKindLabel(
  kind: ConnectorKindFilter,
  t: ReturnType<typeof useLocalization>["t"],
): string {
  if (kind === "all") return t("capabilities.filter.all");
  if (kind === "mcp") return "MCP";
  if (kind === "http") return "HTTP";
  if (kind === "database") return "Database";
  return "CLI";
}
