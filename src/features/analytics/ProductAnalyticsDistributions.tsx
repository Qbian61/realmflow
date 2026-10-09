import type {
  NodeRunAnalyticsStatus,
  ProductAnalyticsResult,
  ProductAnalyticsStatusCount,
  RequirementAnalyticsStatus,
  WorkflowExecutionAnalyticsStatus
} from '../../../shared/product-analytics'
import { useLocalization } from '../../localization/LocalizationProvider'
import type { TranslationKey } from '../../localization/translate'

const STATUS_LABELS: Record<
  | RequirementAnalyticsStatus
  | WorkflowExecutionAnalyticsStatus
  | NodeRunAnalyticsStatus,
  TranslationKey
> = {
  pending: 'productAnalytics.status.pending',
  active: 'productAnalytics.status.active',
  completed: 'productAnalytics.status.completed',
  created: 'productAnalytics.status.created',
  running: 'productAnalytics.status.running',
  waiting_user: 'productAnalytics.status.waitingUser',
  paused: 'productAnalytics.status.paused',
  failed: 'productAnalytics.status.failed',
  cancelled: 'productAnalytics.status.cancelled',
  interrupted: 'productAnalytics.status.interrupted',
  ready: 'productAnalytics.status.ready',
  blocked: 'productAnalytics.status.blocked',
  skipped: 'productAnalytics.status.skipped'
}

function StatusDistribution<TStatus extends string>({
  title,
  items
}: {
  title: TranslationKey
  items: Array<ProductAnalyticsStatusCount<TStatus>>
}): JSX.Element {
  const { t } = useLocalization()
  const maximum = Math.max(1, ...items.map(({ count }) => count))

  return (
    <section
      className="product-analytics-distribution"
      aria-label={t(title)}
    >
      <header>
        <h2>{t(title)}</h2>
      </header>
      <div className="product-analytics-bars">
        {items.map(({ status, count }) => (
          <div key={status}>
            <span>{t(STATUS_LABELS[status as keyof typeof STATUS_LABELS])}</span>
            <i aria-hidden="true">
              <b style={{ width: `${(count / maximum) * 100}%` }} />
            </i>
            <strong>{count}</strong>
          </div>
        ))}
      </div>
    </section>
  )
}

export default function ProductAnalyticsDistributions({
  result
}: {
  result: ProductAnalyticsResult
}): JSX.Element {
  const { t } = useLocalization()
  const maximumWorkflowCount = Math.max(
    1,
    ...result.workflows.map(({ count }) => count)
  )

  return (
    <div className="product-analytics-distributions">
      <StatusDistribution
        title="productAnalytics.requirements.aria"
        items={result.requirements}
      />
      <section
        className="product-analytics-distribution"
        aria-label={t('productAnalytics.workflows.aria')}
      >
        <header>
          <h2>{t('productAnalytics.workflows.aria')}</h2>
        </header>
        {result.workflows.length === 0 ? (
          <p className="model-empty">{t('productAnalytics.workflows.empty')}</p>
        ) : (
          <div className="product-analytics-bars">
            {result.workflows.map(({ templateId, label, count }) => (
              <div key={templateId}>
                <span>{label}</span>
                <i aria-hidden="true">
                  <b
                    style={{ width: `${(count / maximumWorkflowCount) * 100}%` }}
                  />
                </i>
                <strong>{count}</strong>
              </div>
            ))}
          </div>
        )}
      </section>
      <StatusDistribution
        title="productAnalytics.executions.aria"
        items={result.executionStatuses}
      />
      <StatusDistribution
        title="productAnalytics.nodeRuns.aria"
        items={result.nodeRunStatuses}
      />
    </div>
  )
}
