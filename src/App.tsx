import { useState } from 'react'
import { HashRouter, useNavigate } from 'react-router-dom'
import type { RendererRepositories } from './application/ports/repositories'
import { AppRoutes } from './app/AppRoutes'
import { useWorkspaceController } from './app/hooks/use-workspace-controller'
import { useAiRunController } from './app/hooks/use-ai-run-controller'
import { WorkspaceLayout } from './features/navigation/WorkspaceLayout'
import { WorkbenchProvider } from './features/workbench/WorkbenchProvider'
import { createInMemoryRendererRepositories } from './infrastructure/storage/renderer-repositories'

function AppShell({
  repositories: providedRepositories,
  degraded
}: {
  repositories?: RendererRepositories
  degraded: boolean
}): JSX.Element {
  const navigate = useNavigate()
  const [repositories] = useState(
    () => providedRepositories ?? createInMemoryRendererRepositories()
  )
  const {
    spaces,
    requirementsBySpace,
    sessions,
    createSpace,
    renameSpace,
    deleteSpace,
    moveSpace,
    createRequirement,
    deleteRequirement,
    moveRequirement,
    createSession,
    appendSessionMessage,
    persistenceIssues
  } = useWorkspaceController({
    navigationRepository: repositories.workspaceNavigation,
    sessionRepository: repositories.chatSessions,
    business: window.realmflow?.business
  })
  const aiRuns = useAiRunController(window.realmflow?.aiRuns)

  const createSpaceSession = (
    spacePath: string,
    prompt: string,
    modelProfileId?: string
  ): void => {
    navigate(`/sessions/${createSession(spacePath, prompt, modelProfileId)}`)
  }

  return (
    <WorkspaceLayout
      spaces={spaces}
      requirementsBySpace={requirementsBySpace}
      sessions={sessions}
      onCreateSpace={createSpace}
      onRenameSpace={renameSpace}
      onDeleteSpace={deleteSpace}
      onMoveSpace={moveSpace}
      onCreateRequirement={createRequirement}
      onDeleteRequirement={deleteRequirement}
      onMoveRequirement={moveRequirement}
      status={
        degraded || persistenceIssues.length > 0 ? (
          <div
            className="persistence-notice"
            role="status"
            aria-label="本地存储状态"
          >
            当前更改暂时无法保存，请检查本地存储权限或可用空间。
          </div>
        ) : null
      }
    >
      <AppRoutes
        spaces={spaces}
        requirementsBySpace={requirementsBySpace}
        sessions={sessions}
        resourceRepository={repositories.spaceResources}
        onCreateSession={createSpaceSession}
        onAppendMessage={appendSessionMessage}
        aiRuns={aiRuns}
      />
    </WorkspaceLayout>
  )
}

export default function App({
  repositories,
  degraded = false
}: {
  repositories?: RendererRepositories
  degraded?: boolean
}): JSX.Element {
  return (
    <HashRouter>
      <WorkbenchProvider>
        <AppShell repositories={repositories} degraded={degraded} />
      </WorkbenchProvider>
    </HashRouter>
  )
}
