import {
  Bot,
  CheckCircle2,
  CircleDashed,
  Search,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { CapabilityCatalogSnapshotDto } from "../../../shared/capability-catalog";
import type { ToolCatalogDto } from "../../../shared/tool-catalog";
import {
  Button,
  Dialog,
  DialogBody,
  EmptyState,
  IconButton,
} from "../../components/ui";
import { useLocalization } from "../../localization/LocalizationProvider";
import type { TranslationKey } from "../../localization/translate";
import {
  AGENT_PROFILE_SCENES,
  agentProfileSceneLabel,
  buildAgentProfilePortraits,
  filterAgentProfilePortraits,
  type AgentProfilePortrait,
  type AgentProfileReference,
  type AgentProfileScene,
} from "./agent-profile-directory-model";

type AgentProfileDirectoryProps = {
  catalog: ToolCatalogDto;
  capabilities: CapabilityCatalogSnapshotDto;
  loading: boolean;
  query: string;
  onQueryChange: (query: string) => void;
};

export function AgentProfileDirectory({
  catalog,
  capabilities,
  loading,
  query,
  onQueryChange,
}: AgentProfileDirectoryProps): JSX.Element {
  const { t } = useLocalization();
  const [scene, setScene] = useState<AgentProfileScene>("all");
  const [searchExpanded, setSearchExpanded] = useState(Boolean(query));
  const [selectedProfile, setSelectedProfile] =
    useState<AgentProfilePortrait>();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const profiles = useMemo(
    () => buildAgentProfilePortraits({ catalog, capabilities, t }),
    [capabilities, catalog, t],
  );
  const visible = useMemo(
    () => filterAgentProfilePortraits(profiles, { scene, query }),
    [profiles, query, scene],
  );
  const availableScenes = useMemo(
    () =>
      AGENT_PROFILE_SCENES.filter(
        (candidate) =>
          candidate === "all" ||
          profiles.some((profile) => profile.scenarios.includes(candidate)),
      ),
    [profiles],
  );

  useEffect(() => {
    if (query) setSearchExpanded(true);
  }, [query]);

  useEffect(() => {
    if (searchExpanded) searchInputRef.current?.focus();
  }, [searchExpanded]);

  useEffect(() => {
    if (!availableScenes.includes(scene)) setScene("all");
  }, [availableScenes, scene]);

  return (
    <section className="agent-profile-directory">
      <div className="agent-profile-directory-controls">
        <div
          className="agent-profile-scenes"
          role="group"
          aria-label={t("capabilities.agentDirectory.scenes")}
        >
          {availableScenes.map((candidate) => (
            <Button
              key={candidate}
              className={
                candidate === "all" ? "agent-profile-scene-all" : undefined
              }
              size="compact"
              variant="neutral"
              aria-pressed={scene === candidate}
              onClick={() => setScene(candidate)}
            >
              {agentProfileSceneLabel(candidate, t)}
            </Button>
          ))}
        </div>
        <div
          className="capability-search agent-profile-directory-search"
          data-expanded={searchExpanded}
          onBlur={(event) => {
            if (event.currentTarget.contains(event.relatedTarget)) return;
            if (!query) setSearchExpanded(false);
          }}
        >
          <input
            ref={searchInputRef}
            type="search"
            name="agent-profile-directory-search"
            autoComplete="off"
            value={query}
            aria-label={t("capabilities.agentDirectory.search")}
            placeholder={t("capabilities.agentDirectory.search")}
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
        <p className="agent-profile-directory-state">{t("common.loading")}</p>
      ) : visible.length === 0 ? (
        <EmptyState
          className="agent-profile-directory-state"
          icon={<Bot size={20} aria-hidden="true" />}
          title={t("capabilities.agentDirectory.empty")}
        />
      ) : (
        <div className="agent-profile-grid">
          {visible.map((profile) => (
            <AgentProfileCard
              key={profile.key}
              profile={profile}
              onOpen={() => setSelectedProfile(profile)}
            />
          ))}
        </div>
      )}

      <AgentProfileDetailDialog
        profile={selectedProfile}
        onOpenChange={(open) => {
          if (!open) setSelectedProfile(undefined);
        }}
      />
    </section>
  );
}

function AgentProfileCard({
  profile,
  onOpen,
}: {
  profile: AgentProfilePortrait;
  onOpen: () => void;
}): JSX.Element {
  function openFromKeyboard(event: KeyboardEvent<HTMLElement>): void {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onOpen();
  }

  return (
    <article
      className="agent-profile-card"
      role="button"
      tabIndex={0}
      aria-label={`${profile.name} ${profile.description}`}
      onClick={onOpen}
      onKeyDown={openFromKeyboard}
    >
      <div className="agent-profile-avatar" aria-hidden="true">
        {profile.avatar}
      </div>
      <div className="agent-profile-card-copy">
        <strong>{profile.name}</strong>
        <p>{profile.description}</p>
        <div className="agent-profile-card-meta">
          {profile.sceneLabels.slice(0, 2).map((label) => (
            <span key={label}>{label}</span>
          ))}
          <span>{profile.sourceLabel}</span>
        </div>
      </div>
    </article>
  );
}

function AgentProfileDetailDialog({
  profile,
  onOpenChange,
}: {
  profile?: AgentProfilePortrait;
  onOpenChange: (open: boolean) => void;
}): JSX.Element | null {
  const { t } = useLocalization();
  if (!profile) return null;

  return (
    <Dialog
      open
      size="wide"
      className="agent-profile-detail-dialog"
      aria-label={profile.name}
      onOpenChange={onOpenChange}
    >
      <div className="agent-profile-detail-header">
        <div className="agent-profile-detail-title">
          <div className="agent-profile-avatar agent-profile-avatar--large">
            {profile.avatar}
          </div>
          <div>
            <p>{profile.sceneLabels.join(" / ")}</p>
            <h2>{profile.name}</h2>
          </div>
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
      <DialogBody className="agent-profile-detail-body">
        <p className="agent-profile-detail-summary">{profile.description}</p>

        <section className="agent-profile-detail-section agent-profile-persona">
          <h3>{t("capabilities.agentDirectory.persona")}</h3>
          <p>{profile.role}</p>
          <div className="agent-profile-tags">
            {profile.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        </section>

        <section className="agent-profile-detail-section">
          <h3>{t("capabilities.agentDirectory.systemPrompt")}</h3>
          <div className="agent-profile-prompt">
            {profile.promptSections.map((section) => (
              <div key={section.title}>
                <h4>{section.title}</h4>
                <ul>
                  {section.lines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <div className="agent-profile-detail-columns">
          <AgentReferenceSection
            title={t("capabilities.agentDirectory.tools")}
            emptyLabel={t("capabilities.agentDirectory.tools.empty")}
            items={profile.tools}
          />
          <AgentReferenceSection
            title={t("capabilities.agentDirectory.skills")}
            emptyLabel={t("capabilities.agentDirectory.skills.empty")}
            items={profile.skills}
          />
        </div>

        <section className="agent-profile-detail-section">
          <h3>{t("capabilities.agentDirectory.runtime")}</h3>
          <dl className="agent-profile-runtime">
            <div>
              <dt>{t("capabilities.agentDirectory.source")}</dt>
              <dd>{profile.sourceLabel}</dd>
            </div>
            <div>
              <dt>{t("capabilities.agentDirectory.maximumRisk")}</dt>
              <dd>
                {t(
                  `capabilities.risk.${profile.maximumRisk}` as TranslationKey,
                )}
              </dd>
            </div>
            <div>
              <dt>{t("capabilities.agentDirectory.modelCapabilities")}</dt>
              <dd>{formatList(profile.modelCapabilities)}</dd>
            </div>
            <div>
              <dt>{t("capabilities.agentDirectory.reasoningModes")}</dt>
              <dd>{formatList(profile.reasoningModes)}</dd>
            </div>
            <div>
              <dt>{t("capabilities.agentDirectory.budget")}</dt>
              <dd>
                {t("capabilities.agentDirectory.budgetValue", {
                  toolCalls: profile.budgets.maxToolCalls,
                  subagents: profile.budgets.maxSubagents,
                  retries: profile.budgets.maxRetries,
                })}
              </dd>
            </div>
          </dl>
        </section>
      </DialogBody>
    </Dialog>
  );
}

function AgentReferenceSection({
  title,
  emptyLabel,
  items,
}: {
  title: string;
  emptyLabel: string;
  items: AgentProfileReference[];
}): JSX.Element {
  const { t } = useLocalization();
  return (
    <section className="agent-profile-detail-section agent-profile-reference-section">
      <h3>{title}</h3>
      {items.length === 0 ? (
        <p className="agent-profile-reference-empty">{emptyLabel}</p>
      ) : (
        <div className="agent-profile-reference-list">
          {items.map((item) => (
            <div
              key={item.id}
              className="agent-profile-reference-item"
              data-available={item.available}
            >
              <div>
                <strong>{item.name}</strong>
                <p>{item.description}</p>
              </div>
              <span>
                {item.available ? (
                  <CheckCircle2 size={14} aria-hidden="true" />
                ) : (
                  <CircleDashed size={14} aria-hidden="true" />
                )}
                {item.available
                  ? t("capabilities.directory.available")
                  : t("capabilities.agentDirectory.unavailable")}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function formatList(items: readonly string[]): string {
  return items.length > 0 ? items.join(", ") : "-";
}
