import { Plus } from "lucide-react";
import { Card, IconButton } from "../../components/ui";
import { useLocalization } from "../../localization/LocalizationProvider";

type ScheduleRecommendation = {
  id: string;
  name: string;
  description: string;
  cronExpression: string;
};

type ScheduleRecommendationsProps<T extends ScheduleRecommendation> = {
  recommendations: T[];
  onSelect: (recommendation: T) => void;
};

export function ScheduleRecommendations<T extends ScheduleRecommendation>({
  recommendations,
  onSelect,
}: ScheduleRecommendationsProps<T>): JSX.Element {
  const { t } = useLocalization();

  return (
    <section
      className="schedule-section recommended-schedules"
      aria-label={t("schedule.tab.templates")}
    >
      <div className="schedule-recommendation-grid">
        {recommendations.map((item) => (
          <Card
            as="article"
            density="compact"
            interactive
            className="schedule-recommendation"
            key={item.id}
          >
            <div>
              <h3>{item.name}</h3>
              <p>{item.description}</p>
            </div>
            <IconButton
              size="compact"
              variant="ghost"
              aria-label={t("schedule.recommendation.useAria", {
                name: item.name,
              })}
              title={t("tooltip.use")}
              onClick={() => onSelect(item)}
            >
              <Plus size={18} />
            </IconButton>
          </Card>
        ))}
      </div>
    </section>
  );
}
