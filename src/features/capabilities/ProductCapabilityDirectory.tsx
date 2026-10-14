import {
  Bot,
  BookOpen,
  Check,
  FolderSearch,
  Globe2,
  Plug,
  Search,
  Sparkles,
  Terminal,
  Workflow,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { CapabilityInstallation } from "../../../domain/capability";
import type { CapabilityCatalogSnapshotDto } from "../../../shared/capability-catalog";
import type {
  ToolCatalogActivationCommand,
  ToolCatalogDto,
  ToolCatalogSkillDto,
} from "../../../shared/tool-catalog";
import type { SkillRegistryApi } from "../../../shared/skill-registry";
import {
  Button,
  Dialog,
  DialogBody,
  IconButton,
  EmptyState,
} from "../../components/ui";
import { useLocalization } from "../../localization/LocalizationProvider";
import {
  buildProductCapabilityItems,
  filterProductCapabilityItems,
  PRODUCT_CAPABILITY_GROUPS,
  type ProductCapabilityGroup,
  type ProductCapabilityItem,
} from "./product-capability-directory-model";

type ProductCapabilityDirectoryProps = {
  kind: "tool" | "skill";
  catalog: ToolCatalogDto;
  capabilities: CapabilityCatalogSnapshotDto;
  loading: boolean;
  query: string;
  busyTarget?: string;
  busyInstallationId?: string;
  skillRegistry?: SkillRegistryApi;
  onQueryChange: (query: string) => void;
  onCatalogToggle: (command: ToolCatalogActivationCommand) => void;
  onNativeToggle: (
    installation: CapabilityInstallation,
    enabled: boolean,
  ) => void;
  onRefresh: () => Promise<void>;
};

const GROUP_ICONS: Record<
  Exclude<ProductCapabilityGroup, "all">,
  LucideIcon
> = {
  "files-knowledge": FolderSearch,
  "web-browser": Globe2,
  "terminal-code": Terminal,
  "documents-office": BookOpen,
  "workflow-tasks": Workflow,
  "external-services": Plug,
  "runtime-management": Bot,
};

export function ProductCapabilityDirectory({
  kind,
  catalog,
  capabilities,
  loading,
  query,
  busyTarget,
  busyInstallationId,
  skillRegistry,
  onQueryChange,
  onCatalogToggle,
  onNativeToggle,
  onRefresh,
}: ProductCapabilityDirectoryProps): JSX.Element {
  const { t } = useLocalization();
  const [group, setGroup] = useState<ProductCapabilityGroup>("all");
  const [registryBusy, setRegistryBusy] = useState<string>();
  const [searchExpanded, setSearchExpanded] = useState(Boolean(query));
  const [selectedItem, setSelectedItem] = useState<ProductCapabilityItem>();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const items = useMemo(
    () => buildProductCapabilityItems({ kind, catalog, capabilities }),
    [capabilities, catalog, kind],
  );
  const visible = useMemo(
    () => filterProductCapabilityItems(items, { group, query }),
    [group, items, query],
  );
  const availableGroups = useMemo(
    () =>
      PRODUCT_CAPABILITY_GROUPS.filter(
        (candidate) =>
          candidate === "all" ||
          items.some((item) => item.group === candidate),
      ),
    [items],
  );

  useEffect(() => {
    setGroup("all");
    setSelectedItem(undefined);
  }, [kind]);

  useEffect(() => {
    if (query) setSearchExpanded(true);
  }, [query]);

  useEffect(() => {
    if (searchExpanded) searchInputRef.current?.focus();
  }, [searchExpanded]);

  async function reviewRegistrySkill(
    item: ProductCapabilityItem,
  ): Promise<void> {
    const skill = registrySkill(item);
    if (!skillRegistry || !skill?.registry) return;
    setRegistryBusy(item.key);
    try {
      await skillRegistry.review({
        skillId: skill.id,
        version: skill.version,
        digest: skill.definitionDigest,
        status: "approved",
        notes: "",
        expectedRevision: skill.registry.review.revision,
        requestId: `skill-review-${crypto.randomUUID()}`,
      });
      await onRefresh();
    } finally {
      setRegistryBusy(undefined);
    }
  }

  async function toggleRegistrySkill(
    item: ProductCapabilityItem,
  ): Promise<void> {
    const skill = registrySkill(item);
    if (!skillRegistry || !skill?.registry) return;
    setRegistryBusy(item.key);
    try {
      await skillRegistry.setActivation({
        skillId: skill.id,
        version: skill.version,
        digest: skill.definitionDigest,
        enabled: !skill.registry.activation.enabled,
        expectedRevision: skill.registry.activation.revision,
        requestId: `skill-activation-${crypto.randomUUID()}`,
      });
      await onRefresh();
    } finally {
      setRegistryBusy(undefined);
    }
  }

  return (
    <section className="product-capability-directory">
      <div className="product-capability-directory-controls">
        <div
          className="product-capability-groups"
          role="group"
          aria-label={t("capabilities.directory.groups")}
        >
          {availableGroups.map((candidate) => (
            <Button
              key={candidate}
              className={
                candidate === "all"
                  ? "product-capability-group-all"
                  : undefined
              }
              size="compact"
              variant="neutral"
              aria-pressed={group === candidate}
              onClick={() => setGroup(candidate)}
            >
              {groupLabel(candidate, t)}
            </Button>
          ))}
        </div>
        <div
          className="capability-search product-capability-directory-search"
          data-expanded={searchExpanded}
          onBlur={(event) => {
            if (event.currentTarget.contains(event.relatedTarget)) return;
            if (!query) setSearchExpanded(false);
          }}
        >
          <input
            ref={searchInputRef}
            type="search"
            name={`capability-directory-${kind}-search`}
            autoComplete="off"
            value={query}
            aria-label={t(
              kind === "tool"
                ? "capabilities.directory.searchTools"
                : "capabilities.directory.searchSkills",
            )}
            placeholder={t(
              kind === "tool"
                ? "capabilities.directory.searchTools"
                : "capabilities.directory.searchSkills",
            )}
            onChange={(event) => onQueryChange(event.target.value)}
            tabIndex={searchExpanded ? 0 : -1}
          />
          <IconButton
            size="compact"
            variant="ghost"
            title={t("common.search")}
            aria-label={t("common.search")}
            aria-expanded={searchExpanded}
            onClick={() => {
              setSearchExpanded(true);
              searchInputRef.current?.focus();
            }}
          >
            <Search size={17} aria-hidden="true" />
          </IconButton>
        </div>
      </div>

      {loading ? (
        <p className="product-capability-directory-state">
          {t("common.loading")}
        </p>
      ) : visible.length === 0 ? (
        <EmptyState
          className="product-capability-directory-state"
          title={t(
            kind === "tool"
              ? "capabilities.tools.empty"
              : "capabilities.skills.empty",
          )}
        />
      ) : (
        <div className="product-capability-grid">
          {visible.map((item) => (
            <ProductCapabilityRow
              key={item.key}
              item={item}
              onOpen={() => setSelectedItem(item)}
            />
          ))}
        </div>
      )}
      <ProductCapabilityDetailDialog
        item={selectedItem}
        busy={
          selectedItem
            ? registryBusy === selectedItem.key ||
              busyTarget === `${selectedItem.kind}:${selectedItem.id}` ||
              Boolean(
                selectedItem.native &&
                  busyInstallationId === selectedItem.native.installation.id,
              )
            : false
        }
        onOpenChange={(open) => {
          if (!open) setSelectedItem(undefined);
        }}
        onCatalogToggle={onCatalogToggle}
        onNativeToggle={onNativeToggle}
        onReviewRegistry={() => {
          if (selectedItem) void reviewRegistrySkill(selectedItem);
        }}
        onToggleRegistry={() => {
          if (selectedItem) void toggleRegistrySkill(selectedItem);
        }}
      />
    </section>
  );
}

function ProductCapabilityRow({
  item,
  onOpen,
}: {
  item: ProductCapabilityItem;
  onOpen: () => void;
}): JSX.Element {
  const { t } = useLocalization();
  const Icon = item.kind === "skill" ? Sparkles : GROUP_ICONS[item.group];
  const name = capabilityDisplayName(item, t);
  const description = capabilityDescription(item, t);

  function openFromKeyboard(event: KeyboardEvent<HTMLElement>): void {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onOpen();
  }

  return (
    <article
      className="product-capability-row product-capability-row--interactive"
      role="button"
      tabIndex={0}
      aria-label={name}
      onClick={onOpen}
      onKeyDown={openFromKeyboard}
    >
      <div className={`product-capability-icon group-${item.group}`}>
        <Icon size={21} aria-hidden="true" />
      </div>
      <div className="product-capability-copy">
        <strong>{name}</strong>
        <p>{description}</p>
      </div>
    </article>
  );
}

function ProductCapabilityDetailDialog({
  item,
  busy,
  onOpenChange,
  onCatalogToggle,
  onNativeToggle,
  onReviewRegistry,
  onToggleRegistry,
}: {
  item?: ProductCapabilityItem;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onCatalogToggle: ProductCapabilityDirectoryProps["onCatalogToggle"];
  onNativeToggle: ProductCapabilityDirectoryProps["onNativeToggle"];
  onReviewRegistry: () => void;
  onToggleRegistry: () => void;
}): JSX.Element | null {
  const { t } = useLocalization();
  if (!item) return null;

  const Icon = item.kind === "skill" ? Sparkles : GROUP_ICONS[item.group];
  const registry = registrySkill(item)?.registry;
  const dependencyIssues =
    item.catalogItem?.kind === "skill" ? item.catalogItem.dependencyIssues : [];
  const name = capabilityDisplayName(item, t);
  const description = capabilityDescription(item, t);
  const isFacade =
    item.catalogItem?.kind === "tool" &&
    item.catalogItem.modelFacing?.kind === "facade";

  return (
    <Dialog
      open
      size="default"
      className="product-capability-detail-dialog"
      aria-label={name}
      onOpenChange={onOpenChange}
    >
      <div className="product-capability-detail-header">
        <div className={`product-capability-icon group-${item.group}`}>
          <Icon size={21} aria-hidden="true" />
        </div>
        <IconButton
          size="compact"
          variant="ghost"
          title={t("common.close")}
          aria-label={t("common.close")}
          onClick={() => onOpenChange(false)}
        >
          <X size={16} aria-hidden="true" />
        </IconButton>
      </div>
      <DialogBody className="product-capability-detail-body">
        <div className="product-capability-detail-title">
          <h2>{name}</h2>
          <div className="product-capability-detail-action">
            {registry && registry.review.status !== "approved" ? (
              <Button
                size="compact"
                variant="neutral"
                className="product-capability-command"
                disabled={busy || !registry.present}
                onClick={onReviewRegistry}
              >
                <Check size={14} aria-hidden="true" />
                {t("capabilities.skillRegistry.approve")}
              </Button>
            ) : registry ? (
              <CapabilitySwitch
                name={item.name}
                enabled={registry.activation.enabled}
                busy={busy}
                onToggle={onToggleRegistry}
              />
            ) : item.native ? (
              <CapabilitySwitch
                name={item.name}
                enabled={item.native.installation.enabled}
                busy={busy}
                onToggle={() =>
                  onNativeToggle(
                    item.native!.installation,
                    !item.native!.installation.enabled,
                  )
                }
              />
            ) : isFacade || item.readOnly ? (
              <span className="product-capability-available">
                {t("capabilities.directory.available")}
              </span>
            ) : (
              <CapabilitySwitch
                name={name}
                enabled={item.enabled}
                busy={busy}
                onToggle={() =>
                  onCatalogToggle({
                    targetType: item.kind,
                    targetId: item.id,
                    enabled: !item.enabled,
                    idempotencyKey: `${item.kind}-activation-${crypto.randomUUID()}`,
                  })
                }
              />
            )}
          </div>
        </div>
        <p className="product-capability-detail-summary">{description}</p>
        <div className="product-capability-detail-card">
          <p>{description}</p>
          <dl>
            <div>
              <dt>{groupLabel(item.group, t)}</dt>
              <dd>
                {item.coverageCount !== undefined
                  ? t("capabilities.catalogView.coverage", {
                      count: item.coverageCount,
                    })
                  : item.name}
              </dd>
            </div>
            {dependencyIssues.length > 0 ? (
              <div>
                <dt>{t("capabilities.status.dependencyDisabled")}</dt>
                <dd>
                  <ul className="product-capability-dependency-list">
                    {dependencyIssues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
      </DialogBody>
    </Dialog>
  );
}

function capabilityDisplayName(
  item: ProductCapabilityItem,
  t: ReturnType<typeof useLocalization>["t"],
): string {
  return item.productFamily
    ? t(`capabilities.directory.product.${item.productFamily}.name`)
    : item.skillFamily
      ? t(`capabilities.directory.skill.${item.skillFamily}.name`)
      : item.name;
}

function capabilityDescription(
  item: ProductCapabilityItem,
  t: ReturnType<typeof useLocalization>["t"],
): string {
  return item.productFamily
    ? t(`capabilities.directory.product.${item.productFamily}.description`)
    : item.skillFamily
      ? t(`capabilities.directory.skill.${item.skillFamily}.description`)
      : item.description;
}

function CapabilitySwitch({
  name,
  enabled,
  busy,
  onToggle,
}: {
  name: string;
  enabled: boolean;
  busy: boolean;
  onToggle: () => void;
}): JSX.Element {
  const { t } = useLocalization();
  return (
    <button
      className="model-provider-switch"
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={t("capabilities.toggle", {
        action: enabled ? t("common.disable") : t("common.enable"),
        name,
      })}
      disabled={busy}
      onClick={onToggle}
    >
      <span />
    </button>
  );
}

function registrySkill(
  item: ProductCapabilityItem,
): ToolCatalogSkillDto | undefined {
  return item.catalogItem?.kind === "skill" && item.catalogItem.registry
    ? item.catalogItem
    : undefined;
}

function groupLabel(
  group: ProductCapabilityGroup,
  t: ReturnType<typeof useLocalization>["t"],
): string {
  return t(`capabilities.directory.group.${group}`);
}
