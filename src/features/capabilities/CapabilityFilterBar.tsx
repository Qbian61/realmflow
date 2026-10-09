import { Search } from "lucide-react";
import { Toolbar } from "../../components/ui";
import { useLocalization } from "../../localization/LocalizationProvider";

export type CapabilityFilters = {
  query: string;
  source: string;
  scope: string;
  status: string;
  risk: string;
};

export function CapabilityFilterBar({
  value,
  onChange,
}: {
  value: CapabilityFilters;
  onChange: (key: keyof CapabilityFilters, value: string) => void;
}): JSX.Element {
  const { t } = useLocalization();
  const update = (key: keyof CapabilityFilters, next: string): void => {
    onChange(key, next);
  };
  return (
    <Toolbar
      className="capability-filter-bar"
      aria-label={t("capabilities.search")}
    >
      <label className="capability-search">
        <Search size={14} aria-hidden="true" />
        <input
          name="capabilities-search"
          autoComplete="off"
          type="search"
          aria-label={t("capabilities.search")}
          placeholder={t("capabilities.search")}
          value={value.query}
          onChange={(event) => update("query", event.target.value)}
        />
      </label>
      <select
        name="capabilities-source"
        autoComplete="off"
        aria-label={t("capabilities.source")}
        value={value.source}
        onChange={(event) => update("source", event.target.value)}
      >
        <option value="all">{t("capabilities.filter.sourceAll")}</option>
        <option value="builtin">Builtin</option>
        <option value="local_upload">Local</option>
        <option value="manual">Manual</option>
        <option value="generated">Generated</option>
        <option value="mcp">MCP</option>
      </select>
      <select
        name="capabilities-scope"
        autoComplete="off"
        aria-label={t("capabilities.scope")}
        value={value.scope}
        onChange={(event) => update("scope", event.target.value)}
      >
        <option value="all">{t("capabilities.filter.scopeAll")}</option>
        <option value="global">{t("capabilities.scope.global")}</option>
        <option value="work-root">{t("capabilities.scope.workRoot")}</option>
        <option value="folder">{t("capabilities.scope.folder")}</option>
        <option value="workspace">{t("capabilities.scope.workspace")}</option>
        <option value="requirement">
          {t("capabilities.scope.requirement")}
        </option>
      </select>
      <select
        name="capabilities-status"
        autoComplete="off"
        aria-label={t("capabilities.status")}
        value={value.status}
        onChange={(event) => update("status", event.target.value)}
      >
        <option value="all">{t("capabilities.filter.statusAll")}</option>
        <option value="enabled">{t("capabilities.status.enabled")}</option>
        <option value="disabled">{t("capabilities.status.disabled")}</option>
      </select>
      <select
        name="capabilities-risk"
        autoComplete="off"
        aria-label={t("capabilities.risk")}
        value={value.risk}
        onChange={(event) => update("risk", event.target.value)}
      >
        <option value="all">{t("capabilities.filter.riskAll")}</option>
        <option value="low">{t("capabilities.risk.low")}</option>
        <option value="medium">{t("capabilities.risk.medium")}</option>
        <option value="high">{t("capabilities.risk.high")}</option>
        <option value="critical">{t("capabilities.risk.critical")}</option>
      </select>
    </Toolbar>
  );
}
