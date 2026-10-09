const empty = async () => []
const noop = async () => undefined
const subscribe = () => () => undefined

const execution = (id, status, recovery, compactions = []) => ({
  runId: `run-${id}`,
  assistantMessageId: `assistant-${id}`,
  status,
  startedAt: 100,
  answer: '',
  executionSummaries: [],
  references: [],
  toolCalls: [],
  delegations: [],
  compactions,
  lastSequence: 4,
  recovery
})

const session = {
  id: 'recovery-acceptance',
  kind: 'general',
  title: '长任务恢复验收',
  sortOrder: 0,
  messages: [
    {
      id: 'user-retry',
      role: 'user',
      status: 'completed',
      content: '继续执行长任务',
      sortOrder: 0,
      createdAt: 100
    },
    {
      id: 'assistant-retry',
      role: 'assistant',
      status: 'completed',
      content: '正在等待模型服务恢复。',
      runId: 'run-retry',
      execution: execution('retry', 'retrying', {
        reason: 'provider_rate_limited',
        attempt: 2,
        nextRetryAt: 5000
      }),
      sortOrder: 1,
      createdAt: 101
    },
    {
      id: 'user-input',
      role: 'user',
      status: 'completed',
      content: '处理这个文件',
      sortOrder: 2,
      createdAt: 102
    },
    {
      id: 'assistant-input',
      role: 'assistant',
      status: 'completed',
      content: '请确认：仅分析该文件，还是允许修改该文件？',
      runId: 'run-input',
      execution: execution('input', 'waiting_input', {
        reason: 'clarification_required'
      }),
      sortOrder: 3,
      createdAt: 103
    },
    {
      id: 'user-blocked',
      role: 'user',
      status: 'completed',
      content: '恢复昨晚的能力生成任务',
      sortOrder: 4,
      createdAt: 104
    },
    {
      id: 'assistant-blocked',
      role: 'assistant',
      status: 'completed',
      content: '已保留任务目标、约束和未完成项。',
      runId: 'run-blocked',
      execution: execution(
        'blocked',
        'recovery_blocked',
        {
          reason: 'capability_unavailable',
          actions: ['resume', 'branch', 'cancel']
        },
        [
          {
            objectiveCount: 1,
            constraintCount: 3,
            incompleteItemCount: 2,
            sourceCount: 8,
            compactedAt: 105
          }
        ]
      ),
      sortOrder: 5,
      createdAt: 105
    }
  ],
  revision: 1,
  createdAt: 100,
  updatedAt: 105
}

window.realmflow = {
  platform: 'darwin',
  getSidecarStatus: async () => 'ready',
  quitApp: noop,
  business: new Proxy(
    {
      listSpaces: empty,
      listRequirements: empty,
      listRecentConversations: async () => ({
        conversations: [session],
        folderPaths: []
      }),
      getConversation: async () => structuredClone(session),
      onConversationEvent: subscribe
    },
    { get: (target, property) => target[property] ?? empty }
  ),
  workbenchHub: new Proxy(
    {
      layout: {
        get: async () => ({
          revision: 0,
          moduleOrder: ['tasks', 'sites', 'memos', 'terminal', 'system'],
          hiddenModules: []
        }),
        update: async () => ({
          ok: true,
          layout: {
            revision: 1,
            moduleOrder: ['tasks', 'sites', 'memos', 'terminal', 'system'],
            hiddenModules: []
          }
        })
      },
      dashboard: {
        getSnapshot: async () => {
          throw new Error('Dashboard is outside this fixture')
        },
        onInvalidated: subscribe
      }
    },
    {
      get: (target, property) =>
        target[property] ?? new Proxy({}, { get: () => empty })
    }
  ),
  aiRuns: new Proxy(
    { onEvent: subscribe },
    { get: (target, property) => target[property] ?? noop }
  ),
  persistence: {
    load: async () => ({
      status: 'loaded',
      snapshot: { revision: 0, value: null }
    }),
    onChanged: subscribe
  },
  workspace: new Proxy({}, { get: () => empty }),
  webWorkbench: new Proxy(
    { hideAll: noop, onStateChange: subscribe },
    { get: (target, property) => target[property] ?? noop }
  ),
  terminal: new Proxy(
    { onEvent: subscribe },
    { get: (target, property) => target[property] ?? noop }
  ),
  nativeOverlay: new Proxy(
    { onEvent: subscribe },
    { get: (target, property) => target[property] ?? noop }
  ),
  toolCatalog: {
    list: async () => ({ packages: [], tools: [], skills: [] }),
    listMcpServers: empty
  },
  capabilityCatalog: { list: async () => ({ definitions: [], installations: [] }) }
}
