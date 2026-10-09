import type {
  ProductAnalyticsActivity as Activity,
  ProductAnalyticsResult
} from '../../../shared/product-analytics'
import { useLocalization } from '../../localization/LocalizationProvider'
import type { TranslationKey } from '../../localization/translate'

const EVENT_LABELS: Record<Activity['eventType'], TranslationKey> = {
  template_created: 'productAnalytics.event.templateCreated',
  template_revised: 'productAnalytics.event.templateRevised',
  template_published: 'productAnalytics.event.templatePublished',
  template_archived: 'productAnalytics.event.templateArchived',
  instance_created: 'productAnalytics.event.instanceCreated',
  instance_revised: 'productAnalytics.event.instanceRevised',
  execution_created: 'productAnalytics.event.executionCreated',
  execution_status_changed: 'productAnalytics.event.executionStatusChanged',
  execution_current_node_changed:
    'productAnalytics.event.executionCurrentNodeChanged',
  node_run_created: 'productAnalytics.event.nodeRunCreated',
  node_run_status_changed: 'productAnalytics.event.nodeRunStatusChanged',
  advance_enqueued: 'productAnalytics.event.advanceEnqueued',
  advance_started: 'productAnalytics.event.advanceStarted',
  advance_completed: 'productAnalytics.event.advanceCompleted',
  advance_failed: 'productAnalytics.event.advanceFailed'
}

const STATE_LABELS: Partial<Record<string, TranslationKey>> = {
  pending: 'productAnalytics.status.pending',
  active: 'productAnalytics.status.active',
  created: 'productAnalytics.status.created',
  ready: 'productAnalytics.status.ready',
  running: 'productAnalytics.status.running',
  waiting_user: 'productAnalytics.status.waitingUser',
  paused: 'productAnalytics.status.paused',
  blocked: 'productAnalytics.status.blocked',
  completed: 'productAnalytics.status.completed',
  failed: 'productAnalytics.status.failed',
  skipped: 'productAnalytics.status.skipped',
  cancelled: 'productAnalytics.status.cancelled',
  interrupted: 'productAnalytics.status.interrupted'
}

function ActivityItem({ activity }: { activity: Activity }): JSX.Element {
  const { locale, t } = useLocalization()
  const fromLabel = activity.fromState
    ? t(STATE_LABELS[activity.fromState] ?? 'productAnalytics.status.unknown')
    : undefined
  const toLabel = activity.toState
    ? t(STATE_LABELS[activity.toState] ?? 'productAnalytics.status.unknown')
    : undefined

  return (
    <li>
      <span className="product-analytics-activity-mark" aria-hidden="true" />
      <div>
        <strong>{t(EVENT_LABELS[activity.eventType])}</strong>
        <p>
          <span>{activity.workspaceLabel}</span>
          {activity.requirementId && activity.requirementTitle ? (
            <a
              href={`#/spaces/${activity.workspaceId}/requirements/${activity.requirementId}`}
            >
              {activity.requirementTitle}
            </a>
          ) : null}
          {fromLabel && toLabel ? (
            <span>{`${fromLabel} \u2192 ${toLabel}`}</span>
          ) : null}
        </p>
      </div>
      <time dateTime={new Date(activity.occurredAt).toISOString()}>
        {new Intl.DateTimeFormat(locale, {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }).format(activity.occurredAt)}
      </time>
    </li>
  )
}

export default function ProductAnalyticsActivity({
  activities
}: {
  activities: ProductAnalyticsResult['recentActivity']
}): JSX.Element {
  const { t } = useLocalization()

  return (
    <section
      className="product-analytics-activity"
      aria-label={t('productAnalytics.activity.aria')}
    >
      <header>
        <h2>{t('productAnalytics.activity.aria')}</h2>
        <span>{t('productAnalytics.activity.local')}</span>
      </header>
      {activities.length === 0 ? (
        <p className="model-empty">{t('productAnalytics.activity.empty')}</p>
      ) : (
        <ol aria-label={t('productAnalytics.activity.aria')}>
          {activities.map((activity) => (
            <ActivityItem activity={activity} key={activity.id} />
          ))}
        </ol>
      )}
    </section>
  )
}
