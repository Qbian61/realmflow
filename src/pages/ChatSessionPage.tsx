import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Navigate, useParams } from 'react-router-dom'
import logoUrl from '../../logo.png'
import { Composer } from '../components/Composer'
import type {
  ChatSession,
  ChatSessionMessage
} from '../features/sessions/session-store'
import type { WorkspaceSpace } from './RequirementDetailPage'

const followUpSuggestions = [
  '如何调整需求优先级？',
  '如何分配负责人？',
  '如何查看状态统计？'
]

function formatTaskDuration(
  messages: ChatSessionMessage[],
  messageIndex: number
): string {
  const completedAt = messages[messageIndex].createdAt
  const startedAt =
    messages
      .slice(0, messageIndex)
      .reverse()
      .find((message) => message.role !== 'assistant')?.createdAt ?? completedAt
  const totalSeconds = Math.max(1, Math.round((completedAt - startedAt) / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
}

type ChatSessionPageProps = {
  sessions: ChatSession[]
  spaces: WorkspaceSpace[]
  onAppendMessage: (sessionId: string, content: string) => void
}

export default function ChatSessionPage({
  sessions,
  spaces,
  onAppendMessage
}: ChatSessionPageProps): JSX.Element {
  const { sessionId } = useParams()
  const [prompt, setPrompt] = useState('')
  const session = sessions.find((item) => item.id === sessionId)

  if (!session) return <Navigate to="/chat/new" replace />

  const space = spaces.find((item) => item.path === session.spacePath)

  return (
    <main className="chat-session-page">
      <header className="chat-session-header">
        <h1>{session.title}</h1>
        <p>
          <span>{space?.label ?? '未知空间'}</span>
          <span>AI 生成内容请核实</span>
        </p>
      </header>
      <div className="chat-session-scroll">
        <div className="chat-session-messages" aria-label="对话消息">
          {session.messages.map((message, messageIndex) => (
            <article
              className={
                message.role === 'assistant'
                  ? 'chat-message assistant'
                  : 'chat-message user'
              }
              key={message.id}
            >
              {message.role === 'assistant' ? (
                <div
                  className="chat-execution-info"
                  aria-label="RealmFlow 执行信息"
                >
                  <div className="chat-execution-brand">
                    <img
                      className="chat-execution-logo"
                      src={logoUrl}
                      alt=""
                      aria-hidden="true"
                    />
                    <strong>RealmFlow</strong>
                  </div>
                  <div className="chat-execution-duration">
                    <span>
                      任务耗时 {formatTaskDuration(session.messages, messageIndex)}
                    </span>
                    <ChevronRight size={14} strokeWidth={1.8} aria-hidden="true" />
                  </div>
                </div>
              ) : null}
              <p>{message.content}</p>
            </article>
          ))}
          <div className="chat-follow-ups" aria-label="推荐追问">
            {followUpSuggestions.map((suggestion) => (
              <button
                type="button"
                key={suggestion}
                onClick={() => setPrompt(suggestion)}
              >
                {suggestion}
                <span aria-hidden="true">→</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="chat-session-composer">
        <Composer
          value={prompt}
          placeholder="继续当前对话..."
          labels={{
            textarea: '继续对话',
            model: '对话模型',
            workspace: '当前空间',
            permission: '空间权限模式',
            submit: '发送对话消息',
            menu: '添加内容',
            openMenu: '打开添加菜单',
            closeMenu: '关闭添加菜单'
          }}
          insertions={{
            mode: '使用合适的执行模式完成：',
            skill: '调用技能：',
            connector: '使用连接器：'
          }}
          fileInputId={`session-attachment-${session.id}`}
          showContext={false}
          onChange={setPrompt}
          onSubmit={() => {
            const content = prompt.trim()
            if (!content) return
            onAppendMessage(session.id, content)
            setPrompt('')
          }}
        />
      </div>
    </main>
  )
}
