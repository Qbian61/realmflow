import { useState } from 'react'
import { HashRouter, useNavigate } from 'react-router-dom'
import type { RendererRepositories } from './application/ports/repositories'
import { AppRoutes } from './app/AppRoutes'
import { useWorkspaceController } from './app/hooks/use-workspace-controller'
import { WorkspaceLayout } from './features/navigation/WorkspaceLayout'
import { WorkbenchProvider } from './features/workbench/WorkbenchProvider'
import { createLocalRendererRepositories } from './infrastructure/storage/renderer-repositories'

function AppShell({
  repositories: providedRepositories
}: {
  repositories?: RendererRepositories
}): JSX.Element {
  const navigate = useNavigate()
  const [repositories] = useState(
    () => providedRepositories ?? createLocalRendererRepositories()
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
    sessionRepository: repositories.chatSessions
  })

  const createSpaceSession = (spacePath: string, prompt: string): void => {
    navigate(`/sessions/${createSession(spacePath, prompt)}`)
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
        persistenceIssues.length > 0 ? (
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
      />
    </WorkspaceLayout>
  )
}

export default function App({
  repositories
}: {
  repositories?: RendererRepositories
}): JSX.Element {
  return (
    <HashRouter>
      <WorkbenchProvider>
        <AppShell repositories={repositories} />
      </WorkbenchProvider>
    </HashRouter>
  )
}
