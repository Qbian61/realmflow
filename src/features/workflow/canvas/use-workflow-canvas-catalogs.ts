import { useEffect, useState } from 'react'
import type {
  BusinessApi,
  ConnectorDto,
  ModelPoolDto
} from '../../../../shared/business'

export function useWorkflowCanvasCatalogs(business?: BusinessApi): {
  models: ModelPoolDto
  connectors: ConnectorDto[]
} {
  const [models, setModels] = useState<ModelPoolDto>({
    providers: [],
    profiles: []
  })
  const [connectors, setConnectors] = useState<ConnectorDto[]>([])

  useEffect(() => {
    let active = true
    if (!business) return () => undefined
    void Promise.all([
      business.listModels(),
      business.listConnectors()
    ])
      .then(([loadedModels, loadedConnectors]) => {
        if (!active) return
        setModels(loadedModels)
        setConnectors(loadedConnectors)
      })
      .catch(() => {
        if (!active) return
        setModels({ providers: [], profiles: [] })
        setConnectors([])
      })
    return () => {
      active = false
    }
  }, [business])

  return { models, connectors }
}
