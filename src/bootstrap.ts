import type { RealmFlowApi } from '../shared/types'
import type { RendererRepositories } from './application/ports/repositories'

export interface ApplicationRepositoriesResult {
  repositories: RendererRepositories | undefined
  degraded: boolean
}

export async function resolveApplicationRepositories(
  bridge: RealmFlowApi | undefined,
  createRepositories: () => Promise<RendererRepositories>
): Promise<ApplicationRepositoriesResult> {
  if (!bridge) {
    return {
      repositories: undefined,
      degraded: true
    }
  }

  try {
    return {
      repositories: await createRepositories(),
      degraded: false
    }
  } catch (error) {
    console.error(
      'Failed to initialize Electron repositories; using local repositories.',
      error
    )
    return {
      repositories: undefined,
      degraded: true
    }
  }
}
