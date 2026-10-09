import type {
  ModelStatisticsGroupBy,
  ModelStatisticsOptions,
} from "../../../shared/model-statistics";
import type {
  ModelStatisticsPreferences,
  ModelStatisticsTimeRange,
} from "./model-statistics-preferences";
import { Toolbar } from "../../components/ui";
import { useLocalization } from "../../localization/LocalizationProvider";

type Props = {
  value: ModelStatisticsPreferences;
  options: ModelStatisticsOptions;
  disabled: boolean;
  onChange: (value: ModelStatisticsPreferences) => void;
};

const ENTITY_FILTERS = [
  ["providerId", "provider", "providers"],
  ["modelProfileId", "model", "models"],
  ["workspaceId", "workspace", "workspaces"],
  ["requirementId", "requirement", "requirements"],
  ["nodeId", "node", "nodes"],
  ["conversationId", "conversation", "conversations"],
] as const;

export default function ModelStatisticsFilters({
  value,
  options,
  disabled,
  onChange,
}: Props): JSX.Element {
  const { t } = useLocalization();
  const update = (patch: Partial<ModelStatisticsPreferences>): void =>
    onChange({ ...value, ...patch });

  return (
    <Toolbar
      className="analytics-filters"
      aria-label={t("analytics.filters.aria")}
    >
      <label>
        <span>{t("analytics.filters.timeRange")}</span>
        <select name="model-statistics-filters-value-time-range" autoComplete="off"
          value={value.timeRange}
          disabled={disabled}
          onChange={(event) =>
            update({
              timeRange: event.target.value as ModelStatisticsTimeRange,
            })
          }
        >
          <option value="7d">{t("analytics.range.7d")}</option>
          <option value="30d">{t("analytics.range.30d")}</option>
          <option value="90d">{t("analytics.range.90d")}</option>
          <option value="all">{t("analytics.range.all")}</option>
        </select>
      </label>

      {ENTITY_FILTERS.map(([key, label, optionKey]) => (
        <label key={key}>
          <span>{t(`analytics.dimension.${label}`)}</span>
          <select name={`analytics-filter-${key}`} autoComplete="off"
            value={value[key] ?? ""}
            disabled={disabled}
            onChange={(event) =>
              update({ [key]: event.target.value || undefined })
            }
          >
            <option value="">{t("common.all")}</option>
            {options[optionKey].map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ))}

      <label>
        <span>{t("analytics.filters.groupBy")}</span>
        <select name="model-statistics-filters-value-group-by" autoComplete="off"
          value={value.groupBy}
          disabled={disabled}
          onChange={(event) =>
            update({
              groupBy: event.target.value as ModelStatisticsGroupBy,
            })
          }
        >
          {ENTITY_FILTERS.map(([, label]) => (
            <option key={label} value={label}>
              {t(`analytics.dimension.${label}`)}
            </option>
          ))}
        </select>
      </label>
    </Toolbar>
  );
}
