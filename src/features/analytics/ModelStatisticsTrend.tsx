import type { CSSProperties } from "react";
import type { ModelStatisticsTrendPoint } from "../../../shared/model-statistics";
import { useLocalization } from "../../localization/LocalizationProvider";

function formatDay(timestamp: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: "numeric",
    day: "numeric",
  }).format(timestamp);
}

export default function ModelStatisticsTrend({
  points,
}: {
  points: ModelStatisticsTrendPoint[];
}): JSX.Element {
  const { locale, t } = useLocalization();
  const maximum = Math.max(...points.map((point) => point.summary.calls), 1);
  return (
    <section
      className="model-section analytics-trend"
      aria-labelledby="model-trend-heading"
    >
      <header>
        <div>
          <h2 id="model-trend-heading">{t("analytics.trend.heading")}</h2>
          <p>{t("analytics.trend.description")}</p>
        </div>
      </header>
      <div className="analytics-trend-plot">
        {points.length === 0 ? (
          <p className="model-empty">{t("analytics.trend.empty")}</p>
        ) : (
          <ol>
            {points.map((point) => (
              <li key={point.bucketStart}>
                <span>{formatDay(point.bucketStart, locale)}</span>
                <div
                  className="analytics-trend-track"
                  title={t("analytics.trend.callCount", {
                    count: point.summary.calls.toLocaleString(locale),
                  })}
                >
                  <i
                    style={
                      {
                        "--trend-ratio": point.summary.calls / maximum,
                      } as CSSProperties
                    }
                  />
                </div>
                <strong>{point.summary.calls.toLocaleString(locale)}</strong>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
