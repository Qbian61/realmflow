import {
  Bot,
  ChevronDown,
  MessageCirclePlus,
  PackageOpen,
  Plus,
  Settings2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ConnectorDto } from "../../shared/business";
import type {
  McpServerDto,
  ToolCatalogDto,
  ToolCatalogSourceType,
  ToolModelFacingMode,
} from "../../shared/tool-catalog";
import type {
  CapabilityCatalogSnapshotDto,
  CapabilityImportProposalDto,
} from "../../shared/capability-catalog";
import type { CapabilityInstallation } from "../../domain/capability";
import { WorkspaceHeaderPortal } from "../features/navigation/WorkspaceLayout";
import { ToolCatalogPanel } from "../features/capabilities/ToolCatalogPanel";
import { ToolPolicyPanel } from "../features/capabilities/ToolPolicyPanel";
import { SkillRegistryPanel } from "../features/capabilities/SkillRegistryPanel";
import { ConnectorCatalogPanel } from "../features/capabilities/ConnectorCatalogPanel";
import { CapabilityImportDialog } from "../features/capabilities/CapabilityImportDialog";
import { InstalledCapabilityList } from "../features/capabilities/InstalledCapabilityList";
import { filterCapabilitySnapshot } from "../features/capabilities/filter-capability-snapshot";
import { CapabilityBuilderDialog } from "../features/capabilities/CapabilityBuilderDialog";
import {
  CapabilityFilterBar,
  type CapabilityFilters,
} from "../features/capabilities/CapabilityFilterBar";
import { useToast } from "../features/toast/ToastProvider";
import { useLocalization } from "../localization/LocalizationProvider";
import { useUrlQueryState } from "../navigation/url-query-state";
import {
  capabilityQueryCodec,
  capabilityRiskCodec,
  capabilityScopeCodec,
  capabilitySourceCodec,
  capabilityStatusCodec,
  capabilityTabCodec,
} from "./page-query-state";
import {
  Button,
  EmptyState,
  InlineAlert,
  Menu,
  MenuContent,
  MenuItem,
  PageBody,
  PageContainer,
  Tab,
  TabList,
  Tabs,
} from "../components/ui";

type CapabilityTab = "tools" | "skills" | "agents" | "connectors";
type ToolCatalogView = "primitive" | "model-facing" | "directory";
export default function CapabilitiesPage(): JSX.Element {
  const { locale, t } = useLocalization();
  const toast = useToast();
  const business = window.realmflow?.business;
  const toolCatalog = window.realmflow?.toolCatalog;
  const skillRegistry = window.realmflow?.skillRegistry;
  const capabilityCatalog = window.realmflow?.capabilityCatalog;
  const [activeTab, setActiveTab] = useUrlQueryState<CapabilityTab>(
    "tab",
    capabilityTabCodec,
  );
  const [connectors, setConnectors] = useState<ConnectorDto[]>([]);
  const [catalog, setCatalog] = useState<ToolCatalogDto>({
    packages: [],
    tools: [],
    skills: [],
  });
  const [toolCatalogView, setToolCatalogView] =
    useState<ToolCatalogView>("primitive");
  const [mcpServers, setMcpServers] = useState<McpServerDto[]>([]);
  const [busyTarget, setBusyTarget] = useState<string>();
  const [importing, setImporting] = useState<ToolCatalogSourceType>();
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const [manualRequest, setManualRequest] = useState(0);
  const toolCatalogRequest = useRef(0);
  const capabilityCatalogRequest = useRef(0);
  const [proposal, setProposal] = useState<CapabilityImportProposalDto>();
  const [capabilitySnapshot, setCapabilitySnapshot] =
    useState<CapabilityCatalogSnapshotDto>({
      definitions: [],
      installations: [],
      displayByDefinitionKey: {},
    });
  const [installingProposal, setInstallingProposal] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [busyInstallationId, setBusyInstallationId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useUrlQueryState("query", capabilityQueryCodec);
  const [source, setSource] = useUrlQueryState(
    "source",
    capabilitySourceCodec,
  );
  const [scope, setScope] = useUrlQueryState("scope", capabilityScopeCodec);
  const [status, setStatus] = useUrlQueryState(
    "status",
    capabilityStatusCodec,
  );
  const [risk, setRisk] = useUrlQueryState("risk", capabilityRiskCodec);
  const filters: CapabilityFilters = { query, source, scope, status, risk };
  const filteredCapabilitySnapshot = useMemo(
    () => filterCapabilitySnapshot(capabilitySnapshot, filters),
    [capabilitySnapshot, filters],
  );
  const currentCatalogQuery = (): {
    locale: typeof locale;
    modelFacingMode?: ToolModelFacingMode;
  } =>
    toolCatalogView === "model-facing"
      ? { locale, modelFacingMode: "facade" }
      : toolCatalogView === "directory"
        ? { locale, modelFacingMode: "directory" }
      : { locale };

  useEffect(() => {
    if (!business || !toolCatalog) {
      setError(t("capabilities.unavailable"));
      setLoading(false);
      return;
    }

    const request = ++toolCatalogRequest.current;
    void Promise.all([
      business.listConnectors(),
      toolCatalog.list(currentCatalogQuery()),
      toolCatalog.listMcpServers(),
    ])
      .then(([nextConnectors, nextCatalog, nextMcpServers]) => {
        if (request !== toolCatalogRequest.current) return;
        setConnectors(nextConnectors);
        setCatalog(nextCatalog);
        setMcpServers(nextMcpServers);
        setError("");
      })
      .catch(() => {
        if (request !== toolCatalogRequest.current) return;
        setError(t("capabilities.loadFailed"));
      })
      .finally(() => {
        if (request === toolCatalogRequest.current) setLoading(false);
      });
  }, [business, locale, t, toolCatalog, toolCatalogView]);

  useEffect(() => {
    if (!capabilityCatalog) return;
    const request = ++capabilityCatalogRequest.current;
    void capabilityCatalog
      .list({ locale })
      .then((snapshot) => {
        if (request === capabilityCatalogRequest.current) {
          setCapabilitySnapshot(snapshot);
        }
      })
      .catch(() => {
        if (request === capabilityCatalogRequest.current) {
          setError(t("capabilities.loadFailed"));
        }
      });
  }, [capabilityCatalog, locale, t]);

  async function toggleActivation(command: {
    targetType: "package" | "tool" | "skill";
    targetId: string;
    enabled: boolean;
    idempotencyKey: string;
  }): Promise<void> {
    if (!toolCatalog) return;
    setBusyTarget(`${command.targetType}:${command.targetId}`);
    try {
      await toolCatalog.setActivation(command);
      setCatalog(await toolCatalog.list(currentCatalogQuery()));
    } catch {
      toast.error("capabilities.updateFailed");
    } finally {
      setBusyTarget(undefined);
    }
  }

  async function changeExtensionPackageVersion(command: {
    packageId: string;
    targetVersion: string;
    operation: "upgrade" | "rollback";
    idempotencyKey: string;
  }): Promise<void> {
    if (!toolCatalog) return;
    setBusyTarget(`package:${command.packageId}`);
    try {
      await toolCatalog.changePackageVersion(command);
      setCatalog(await toolCatalog.list(currentCatalogQuery()));
    } catch {
      toast.error("capabilities.updateFailed");
    } finally {
      setBusyTarget(undefined);
    }
  }

  async function importPackage(
    sourceType: ToolCatalogSourceType,
  ): Promise<void> {
    if (!toolCatalog) return;
    setImporting(sourceType);
    try {
      const imported = await toolCatalog.chooseAndImport({
        sourceType,
        idempotencyKey: `extension-import-${crypto.randomUUID()}`,
      });
      if (imported) setCatalog(await toolCatalog.list(currentCatalogQuery()));
    } catch {
      toast.error("capabilities.importFailed");
    } finally {
      setImporting(undefined);
    }
  }

  async function prepareCapabilityPackage(): Promise<void> {
    if (!capabilityCatalog) return;
    setImporting("archive");
    try {
      const next = await capabilityCatalog.chooseAndPrepare({
        sourceType: "archive",
      });
      if (next) setProposal(next);
    } catch {
      toast.error("capabilities.importFailed");
    } finally {
      setImporting(undefined);
    }
  }

  async function installCapabilityPackage(): Promise<void> {
    if (!capabilityCatalog || !proposal) return;
    setInstallingProposal(true);
    try {
      const installed = await capabilityCatalog.install({
        proposalId: proposal.proposalId,
        scope: { kind: "global" },
        enable: false,
      });
      setCapabilitySnapshot(await capabilityCatalog.list({ locale }));
      setActiveTab(`${installed.definition.kind}s` as CapabilityTab);
      setProposal(undefined);
    } catch {
      toast.error("capabilities.importFailed");
    } finally {
      setInstallingProposal(false);
    }
  }

  async function discardCapabilityPackage(): Promise<void> {
    if (!capabilityCatalog || !proposal) return;
    const proposalId = proposal.proposalId;
    setProposal(undefined);
    try {
      await capabilityCatalog.discard(proposalId);
    } catch {
      toast.error("capabilities.importFailed");
    }
  }

  async function setCapabilityEnabled(
    installation: CapabilityInstallation,
    enabled: boolean,
  ): Promise<void> {
    if (!capabilityCatalog) return;
    setBusyInstallationId(installation.id);
    try {
      const updated = await capabilityCatalog.setEnabled({
        installationId: installation.id,
        enabled,
        expectedRevision: installation.revision,
      });
      replaceCapabilityInstallation(updated);
    } catch {
      toast.error("capabilities.updateFailed");
    } finally {
      setBusyInstallationId(undefined);
    }
  }

  async function changeCapabilityVersion(
    installation: CapabilityInstallation,
    targetVersion: string,
    operation: "upgrade" | "rollback",
  ): Promise<void> {
    if (!capabilityCatalog) return;
    setBusyInstallationId(installation.id);
    try {
      const updated = await capabilityCatalog.changeVersion({
        installationId: installation.id,
        targetVersion,
        expectedRevision: installation.revision,
        operation,
      });
      replaceCapabilityInstallation(updated);
    } catch {
      toast.error("capabilities.updateFailed");
    } finally {
      setBusyInstallationId(undefined);
    }
  }

  async function deleteCapability(
    installation: CapabilityInstallation,
  ): Promise<void> {
    if (!capabilityCatalog) return;
    setBusyInstallationId(installation.id);
    try {
      const result = await capabilityCatalog.delete({
        installationId: installation.id,
        expectedRevision: installation.revision,
      });
      if (result.status === "referenced") {
        toast.error("capabilities.deleteReferenced");
        return;
      }
      setCapabilitySnapshot((current) => ({
        ...current,
        definitions: current.definitions.filter(
          (definition) =>
            definition.id !== installation.capabilityId ||
            definition.version !== installation.capabilityVersion,
        ),
        installations: current.installations.filter(
          (candidate) => candidate.id !== installation.id,
        ),
        displayByDefinitionKey: Object.fromEntries(
          Object.entries(current.displayByDefinitionKey ?? {}).filter(
            ([key]) =>
              key !==
              `${installation.capabilityId}@${installation.capabilityVersion}`,
          ),
        ),
      }));
    } catch {
      toast.error("capabilities.updateFailed");
    } finally {
      setBusyInstallationId(undefined);
    }
  }

  function replaceCapabilityInstallation(
    updated: CapabilityInstallation,
  ): void {
    setCapabilitySnapshot((current) => ({
      ...current,
      installations: current.installations.map((installation) =>
        installation.id === updated.id ? updated : installation,
      ),
    }));
  }

  return (
    <div className="capabilities-page">
      <h1 className="sr-only">{t("navigation.capabilities")}</h1>
      <WorkspaceHeaderPortal>
        <div className="capabilities-page-header">
          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as CapabilityTab)}
          >
            <TabList
              className="capabilities-page-tabs"
              aria-label={t("capabilities.tabs")}
            >
              <Tab
                id="capabilities-tools-tab"
                aria-controls="capabilities-tools-panel"
                value="tools"
              >
                {t("capabilities.tab.tools")}
              </Tab>
              <Tab
                id="capabilities-skills-tab"
                aria-controls="capabilities-skills-panel"
                value="skills"
              >
                {t("capabilities.tab.skills")}
              </Tab>
              <Tab
                id="capabilities-agents-tab"
                aria-controls="capabilities-agents-panel"
                value="agents"
              >
                {t("capabilities.tab.agents")}
              </Tab>
              <Tab
                id="capabilities-connectors-tab"
                aria-controls="capabilities-connectors-panel"
                value="connectors"
              >
                {t("capabilities.tab.connectors")}
              </Tab>
            </TabList>
          </Tabs>
          <div className="capabilities-add">
            <Button
              ref={addMenuTriggerRef}
              className="capabilities-add-trigger"
              size="compact"
              aria-haspopup="menu"
              aria-expanded={addMenuOpen}
              onClick={() => setAddMenuOpen((open) => !open)}
            >
              <Plus size={14} aria-hidden="true" />
              {t("capabilities.add")}
              <ChevronDown size={13} aria-hidden="true" />
            </Button>
            <Menu
              open={addMenuOpen}
              onOpenChange={setAddMenuOpen}
              trigger={addMenuTriggerRef.current}
            >
              <MenuContent className="capabilities-add-menu">
                <MenuItem
                  onSelect={() => {
                    if (!window.realmflow?.capabilityBuilder) {
                      toast.error("capabilities.unavailable");
                      return;
                    }
                    setBuilderOpen(true);
                  }}
                >
                  <MessageCirclePlus size={15} aria-hidden="true" />
                  {t("capabilities.add.conversation")}
                </MenuItem>
                <MenuItem
                  onSelect={() => {
                    void prepareCapabilityPackage();
                  }}
                >
                  <PackageOpen size={15} aria-hidden="true" />
                  {t("capabilities.add.import")}
                </MenuItem>
                <MenuItem
                  onSelect={() => {
                    setActiveTab("connectors");
                    setManualRequest((request) => request + 1);
                  }}
                >
                  <Settings2 size={15} aria-hidden="true" />
                  {t("capabilities.add.manual")}
                </MenuItem>
              </MenuContent>
            </Menu>
          </div>
        </div>
      </WorkspaceHeaderPortal>

      <PageBody mode="wide" className="capabilities-content">
        <PageContainer>
          {error ? (
            <InlineAlert
              className="model-page-error"
              tone="danger"
              title={<span className="model-page-error">{error}</span>}
            />
          ) : null}
          <CapabilityFilterBar
            value={filters}
            onChange={(key, value) => {
              if (key === "query") {
                setQuery(value, { replace: true });
              } else if (key === "source") {
                setSource(value as typeof source);
              } else if (key === "scope") {
                setScope(value as typeof scope);
              } else if (key === "status") {
                setStatus(value as typeof status);
              } else {
                setRisk(value as typeof risk);
              }
            }}
          />

          {business && activeTab === "tools" ? (
            <div
              id="capabilities-tools-panel"
              role="tabpanel"
              aria-labelledby="capabilities-tools-tab"
            >
              <InstalledCapabilityList
                kind="tool"
                {...filteredCapabilitySnapshot}
                busyInstallationId={busyInstallationId}
                onSetEnabled={(installation, enabled) =>
                  void setCapabilityEnabled(installation, enabled)
                }
                onChangeVersion={(installation, version, operation) =>
                  void changeCapabilityVersion(installation, version, operation)
                }
                onDelete={(installation) => void deleteCapability(installation)}
              />
              {toolCatalog ? (
                <ToolCatalogPanel
                  activeTab="tools"
                  catalog={catalog}
                  catalogView={toolCatalogView}
                  loading={loading}
                  busyTarget={busyTarget}
                  importing={importing}
                  onCatalogViewChange={setToolCatalogView}
                  onToggle={(command) => void toggleActivation(command)}
                  onChangePackageVersion={(command) =>
                    void changeExtensionPackageVersion(command)
                  }
                  onImport={(sourceType) => void importPackage(sourceType)}
                />
              ) : null}
            </div>
          ) : null}

          {activeTab === "skills" ? (
            <div
              id="capabilities-skills-panel"
              role="tabpanel"
              aria-labelledby="capabilities-skills-tab"
            >
              {skillRegistry ? (
                <SkillRegistryPanel api={skillRegistry} />
              ) : null}
              <InstalledCapabilityList
                kind="skill"
                {...filteredCapabilitySnapshot}
                busyInstallationId={busyInstallationId}
                onSetEnabled={(installation, enabled) =>
                  void setCapabilityEnabled(installation, enabled)
                }
                onChangeVersion={(installation, version, operation) =>
                  void changeCapabilityVersion(installation, version, operation)
                }
                onDelete={(installation) => void deleteCapability(installation)}
              />
              {toolCatalog ? (
                <ToolCatalogPanel
                  activeTab="skills"
                  catalog={catalog}
                  catalogView={toolCatalogView}
                  loading={loading}
                  busyTarget={busyTarget}
                  importing={importing}
                  onCatalogViewChange={setToolCatalogView}
                  onToggle={(command) => void toggleActivation(command)}
                  onChangePackageVersion={(command) =>
                    void changeExtensionPackageVersion(command)
                  }
                  onImport={(sourceType) => void importPackage(sourceType)}
                />
              ) : null}
            </div>
          ) : null}

          {activeTab === "agents" ? (
            <div
              id="capabilities-agents-panel"
              role="tabpanel"
              aria-labelledby="capabilities-agents-tab"
            >
              {window.realmflow?.toolPolicy ? (
                <ToolPolicyPanel api={window.realmflow.toolPolicy} business={business} />
              ) : null}
              <InstalledCapabilityList
                kind="agent"
                {...filteredCapabilitySnapshot}
                busyInstallationId={busyInstallationId}
                onSetEnabled={(installation, enabled) =>
                  void setCapabilityEnabled(installation, enabled)
                }
                onChangeVersion={(installation, version, operation) =>
                  void changeCapabilityVersion(installation, version, operation)
                }
                onDelete={(installation) => void deleteCapability(installation)}
              />
              {capabilitySnapshot.definitions.every(
                (definition) => definition.kind !== "agent",
              ) ? (
                <EmptyState
                  className="capabilities-agent-empty"
                  icon={<Bot size={20} aria-hidden="true" />}
                  title={t("capabilities.agents.empty")}
                />
              ) : null}
            </div>
          ) : null}

          {business && toolCatalog && activeTab === "connectors" ? (
            <div
              id="capabilities-connectors-panel"
              role="tabpanel"
              aria-labelledby="capabilities-connectors-tab"
            >
              <ConnectorCatalogPanel
                business={business}
                toolCatalog={toolCatalog}
                connectors={connectors}
                mcpServers={mcpServers}
                loading={loading}
                manualRequest={manualRequest}
                onConnectorsChange={setConnectors}
                onMcpServersChange={setMcpServers}
                onCatalogChange={async () => {
                  setCatalog(await toolCatalog.list(currentCatalogQuery()));
                }}
                onError={setError}
                {...filteredCapabilitySnapshot}
                busyInstallationId={busyInstallationId}
                onSetEnabled={(installation, enabled) =>
                  void setCapabilityEnabled(installation, enabled)
                }
                onChangeVersion={(installation, version, operation) =>
                  void changeCapabilityVersion(installation, version, operation)
                }
                onDelete={(installation) => void deleteCapability(installation)}
              />
            </div>
          ) : null}
        </PageContainer>
      </PageBody>
      {proposal ? (
        <CapabilityImportDialog
          proposal={proposal}
          installing={installingProposal}
          onCancel={() => void discardCapabilityPackage()}
          onInstall={() => void installCapabilityPackage()}
        />
      ) : null}
      {builderOpen && window.realmflow?.capabilityBuilder ? (
        <CapabilityBuilderDialog
          api={window.realmflow.capabilityBuilder}
          platform={capabilityBuilderPlatform(window.realmflow.platform)}
          onClose={() => setBuilderOpen(false)}
          onInstalled={(installed) => {
            setActiveTab(`${installed.definition.kind}s` as CapabilityTab);
            if (capabilityCatalog) {
              void capabilityCatalog
                .list(currentCatalogQuery())
                .then(setCapabilitySnapshot);
            }
          }}
        />
      ) : null}
    </div>
  );
}

function capabilityBuilderPlatform(
  platform: NodeJS.Platform,
): "darwin" | "win32" | "linux" {
  if (platform === "win32" || platform === "linux") return platform;
  return "darwin";
}
