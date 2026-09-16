import { ArrowUpRight } from 'lucide-react'
import { Navigate, Route, Routes } from 'react-router-dom'
import type { SpaceResourceRepository } from '../application/ports/repositories'
import type { ChatSession } from '../domain/chat-session'
import type {
  WorkspaceRequirement,
  WorkspaceSpace
} from '../domain/workspace'
import { primaryNavigation, utilityPages } from '../navigation'
import ChatSessionPage from '../pages/ChatSessionPage'
import { NewChatPage } from '../pages/NewChatPage'
import RequirementDetailPage from '../pages/RequirementDetailPage'
import SchedulePage from '../pages/SchedulePage'
import SpaceDetailPage from '../pages/SpaceDetailPage'

type AppRoutesProps = {
  spaces: WorkspaceSpace[]
  requirementsBySpace: Record<string, WorkspaceRequirement[]>
  sessions: ChatSession[]
  resourceRepository: SpaceResourceRepository
  onCreateSession: (spacePath: string, prompt: string) => void
  onAppendMessage: (sessionId: string, content: string) => void
}

export function AppRoutes({
  spaces,
  requirementsBySpace,
  sessions,
  resourceRepository,
  onCreateSession,
  onAppendMessage
}: AppRoutesProps): JSX.Element {
  const allPages = [...primaryNavigation, ...spaces, ...utilityPages]
  return (
    <Routes>
      <Route
        path="/chat/new"
        element={
          <NewChatPage
            spaces={spaces}
            onCreateSession={onCreateSession}
          />
        }
      />
      <Route path="/schedules" element={<SchedulePage />} />
      <Route
        path="/spaces/:spaceId"
        element={
          <SpaceDetailPage
            spaces={spaces}
            requirementsBySpace={requirementsBySpace}
            resourceRepository={resourceRepository}
            onCreateSession={onCreateSession}
          />
        }
      />
      <Route
        path="/sessions/:sessionId"
        element={
          <ChatSessionPage
            sessions={sessions}
            spaces={spaces}
            onAppendMessage={onAppendMessage}
          />
        }
      />
      <Route
        path="/spaces/:spaceId/requirements/:requirementId"
        element={
          <RequirementDetailPage
            spaces={spaces}
            requirementsBySpace={requirementsBySpace}
          />
        }
      />
      {allPages
        .filter(
          ({ path }) =>
            path !== '/chat/new' &&
            path !== '/schedules' &&
            !path.startsWith('/spaces/')
        )
        .map(({ path, label, description }) => (
          <Route
            key={path}
            path={path}
            element={<EmptyPage title={label} description={description} />}
          />
        ))}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function EmptyPage({
  title,
  description
}: {
  title: string
  description: string
}): JSX.Element {
  return (
    <main className="page">
      <div className="page-kicker">REALMFLOW / {title.toUpperCase()}</div>
      <div className="page-heading">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <div className="page-mark" aria-hidden="true">
          <ArrowUpRight size={22} strokeWidth={1.7} />
        </div>
      </div>
      <div className="page-rule" />
      <section className="empty-state">
        <span>模块已就绪</span>
        <strong>{title}</strong>
      </section>
    </main>
  )
}
