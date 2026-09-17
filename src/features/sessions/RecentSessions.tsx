import { ChevronDown, MessageCircle } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import type { WorkspaceSpace } from '../../domain/workspace'
import type { ChatSession } from '../../domain/chat-session'

type RecentSessionsProps = {
  sessions: ChatSession[]
  spaces: WorkspaceSpace[]
  open: boolean
  onToggle: () => void
}

export function RecentSessions({
  sessions,
  spaces,
  open,
  onToggle
}: RecentSessionsProps): JSX.Element {
  const spaceLabels = new Map(spaces.map((space) => [space.path, space.label]))
  const recentSessions = sessions.filter(
    (session) => session.kind !== 'requirement_node'
  )

  return (
    <section
      className={open ? 'recent-section open' : 'recent-section collapsed'}
      aria-label="最近对话"
    >
      <div className="recent-heading">
        <h2>
          <button
            className="recent-toggle"
            type="button"
            aria-expanded={open}
            onClick={onToggle}
          >
            <span>最近 ({recentSessions.length})</span>
            <ChevronDown
              className={open ? 'recent-chevron open' : 'recent-chevron'}
              size={14}
            />
          </button>
        </h2>
      </div>
      {open && recentSessions.length > 0 ? (
        <nav className="recent-session-list" aria-label="最近对话列表">
          {recentSessions.map((session) => (
            <NavLink
              to={`/sessions/${session.id}`}
              className={({ isActive }) =>
                isActive ? 'recent-session active' : 'recent-session'
              }
              title={`${session.title} · ${
                spaceLabels.get(session.spacePath) ?? '未知空间'
              }`}
              key={session.id}
            >
              <span className="recent-session-icon" aria-hidden="true">
                <MessageCircle size={14} strokeWidth={1.8} />
              </span>
              <span>{session.title}</span>
            </NavLink>
          ))}
        </nav>
      ) : open ? (
        <p className="recent-empty">暂无对话</p>
      ) : null}
    </section>
  )
}
