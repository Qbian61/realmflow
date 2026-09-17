import { useEffect, useMemo, useState } from 'react'
import type { ModelCallMetric, ModelProfile } from '../../domain/model'

type ProfileRecord = ModelProfile & { revision: number }

type MetricSummary = {
  calls: number
  tokens: number
  averageFirstTokenLatency: number
  successRate: number
  cost: number
}

function summarize(metrics: ModelCallMetric[]): MetricSummary {
  const latencies = metrics.flatMap((metric) =>
    metric.firstTokenLatencyMs === undefined
      ? []
      : [metric.firstTokenLatencyMs]
  )
  return {
    calls: metrics.length,
    tokens: metrics.reduce(
      (total, metric) =>
        total + metric.inputTokens + metric.outputTokens,
      0
    ),
    averageFirstTokenLatency:
      latencies.length === 0
        ? 0
        : latencies.reduce((total, latency) => total + latency, 0) /
          latencies.length,
    successRate:
      metrics.length === 0
        ? 0
        : (metrics.filter((metric) => metric.status === 'completed').length /
            metrics.length) *
          100,
    cost: metrics.reduce((total, metric) => total + metric.estimatedCost, 0)
  }
}

function formatLatency(value: number): string {
  return `${Math.round(value).toLocaleString()} ms`
}

function formatRate(value: number): string {
  return `${value.toFixed(value === 0 || value === 100 ? 0 : 1)}%`
}

function formatCost(value: number): string {
  return `$${value.toFixed(4)}`
}

export default function AnalyticsPage(): JSX.Element {
  const business = window.realmflow?.business
  const [profiles, setProfiles] = useState<ProfileRecord[]>([])
  const [metrics, setMetrics] = useState<ModelCallMetric[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!business) {
      setError('模型统计服务当前不可用')
      setLoading(false)
      return
    }
    void Promise.all([business.listModels(), business.listModelMetrics()])
      .then(([pool, records]) => {
        setProfiles(pool.profiles)
        setMetrics(records)
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : '模型统计加载失败')
      })
      .finally(() => setLoading(false))
  }, [business])

  const summary = useMemo(() => summarize(metrics), [metrics])
  const profileRows = useMemo(() => {
    const profileNames = new Map(
      profiles.map((profile) => [profile.id, profile.displayName])
    )
    const grouped = new Map<string, ModelCallMetric[]>()
    metrics.forEach((metric) => {
      grouped.set(metric.modelProfileId, [
        ...(grouped.get(metric.modelProfileId) ?? []),
        metric
      ])
    })
    return [...grouped.entries()].map(([profileId, records]) => ({
      id: profileId,
      name: profileNames.get(profileId) ?? profileId,
      summary: summarize(records)
    }))
  }, [metrics, profiles])

  return (
    <main className="model-page analytics-page">
      <header className="model-page-heading">
        <div>
          <span>ANALYTICS / MODELS</span>
          <h1>统计分析</h1>
          <p>汇总模型调用质量、速度与估算成本。</p>
        </div>
      </header>

      {error ? <p className="model-page-error" role="alert">{error}</p> : null}

      <section className="analytics-summary" aria-label="模型调用总览">
        <div>
          <span>调用数</span>
          <strong>{summary.calls.toLocaleString()}</strong>
        </div>
        <div>
          <span>Token</span>
          <strong>{summary.tokens.toLocaleString()}</strong>
        </div>
        <div>
          <span>平均首 Token 延迟</span>
          <strong>{formatLatency(summary.averageFirstTokenLatency)}</strong>
        </div>
        <div>
          <span>成功率</span>
          <strong>{formatRate(summary.successRate)}</strong>
        </div>
        <div>
          <span>估算成本</span>
          <strong>{formatCost(summary.cost)}</strong>
        </div>
      </section>

      <section className="model-section analytics-detail" aria-labelledby="model-usage-heading">
        <header>
          <div>
            <h2 id="model-usage-heading">按模型</h2>
            <p>首 Token 延迟仅统计已返回首个 Token 的调用。</p>
          </div>
        </header>
        {loading ? <p className="model-empty">正在加载...</p> : null}
        {!loading && profileRows.length === 0 ? (
          <p className="model-empty">暂无模型调用记录</p>
        ) : null}
        {profileRows.length > 0 ? (
          <div className="analytics-table-wrap">
            <table className="analytics-table">
              <thead>
                <tr>
                  <th>模型</th>
                  <th>调用数</th>
                  <th>Token</th>
                  <th>首 Token 延迟</th>
                  <th>成功率</th>
                  <th>估算成本</th>
                </tr>
              </thead>
              <tbody>
                {profileRows.map((row) => (
                  <tr key={row.id}>
                    <th scope="row">{row.name}</th>
                    <td>{row.summary.calls.toLocaleString()}</td>
                    <td>{row.summary.tokens.toLocaleString()}</td>
                    <td>{formatLatency(row.summary.averageFirstTokenLatency)}</td>
                    <td>{formatRate(row.summary.successRate)}</td>
                    <td>{formatCost(row.summary.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </main>
  )
}
