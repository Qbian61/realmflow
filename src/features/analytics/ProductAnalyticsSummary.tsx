import {
  Boxes,
  CircleDotDashed,
  FolderKanban,
  ListChecks,
  Workflow,
} from "lucide-react";
import type { ProductAnalyticsSummary as Summary } from "../../../shared/product-analytics";
import { Metric } from "../../components/ui";
import { useLocalization } from "../../localization/LocalizationProvider";
import type { TranslationKey } from "../../localization/translate";

const METRICS: Array<{
  key: keyof Summary;
  label: TranslationKey;
  icon: typeof Boxes;
}> = [
  {
    key: "workspaces",
    label: "productAnalytics.metric.workspaces",
    icon: Boxes,
  },
  {
    key: "requirements",
    label: "productAnalytics.metric.requirements",
    icon: ListChecks,
  },
  {
    key: "workflows",
    label: "productAnalytics.metric.workflows",
    icon: Workflow,
  },
  {
    key: "executions",
    label: "productAnalytics.metric.executions",
    icon: CircleDotDashed,
  },
  {
    key: "nodeRuns",
    label: "productAnalytics.metric.nodeRuns",
    icon: FolderKanban,
  },
];

export default function ProductAnalyticsSummary({
  summary,
}: {
  summary: Summary;
}): JSX.Element {
  const { locale, t } = useLocalization();

  return (
    <section
      className="product-analytics-summary"
      aria-label={t("productAnalytics.summary.aria")}
    >
      {METRICS.map(({ key, label, icon: Icon }) => (
        <Metric
          key={key}
          label={
            <>
              <Icon aria-hidden="true" size={16} />
              {t(label)}
            </>
          }
          value={summary[key].toLocaleString(locale)}
        />
      ))}
    </section>
  );
}
