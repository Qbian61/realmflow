import React from 'react'
import { createRoot } from 'react-dom/client'
import { PermissionPromptHost } from '../src/features/permissions/PermissionPromptHost'
import { LocalizationProvider } from '../src/localization/LocalizationProvider'
import { Composer } from '../src/components/Composer'
import type { ToolPermissionApi, PendingToolPermissionView } from '../shared/tool-permissions'
import '../src/styles.css'
import '../src/components/ui/ui.css'

let requests: PendingToolPermissionView[] = [{
  schemaVersion: 2, id: 'fixture-permission', executionId: 'fixture-execution',
  runId: 'fixture-run', callId: 'fixture-call', toolId: 'builtin.process.run',
  toolName: '终端命令', status: 'requested', reason: 'process', risk: 'high',
  effectsDigest: 'a'.repeat(64), argumentsDigest: 'b'.repeat(64),
  bindingRevision: 1, requestRevision: 1, requestedAt: Date.now(),
  expiresAt: Date.now() + 3_600_000, resources: [
    { kind: 'path', label: '/workspace/reports/result.txt' },
    { kind: 'process', label: 'touch /workspace/reports/result.txt && ls -l /workspace/reports/result.txt' }
  ]
}]
const api: ToolPermissionApi = {
  listPending: async () => requests,
  onChanged: () => () => undefined,
  resolve: async command => {
    document.body.dataset.decision = command.decision
    const resolved = { ...requests[0], status: command.decision === 'deny'
      ? 'denied' as const : 'approved' as const, decision: command.decision }
    requests = []
    return resolved
  }
}
createRoot(document.getElementById('root')!).render(
  <LocalizationProvider>
    <main style={{ maxWidth: 780, margin: '48px auto', padding: 24 }}>
      <Composer value="保留草稿" onChange={() => undefined} onSubmit={() => undefined}
        permissionRunIds={['fixture-run']} placeholder="追加任务指令"
        fileInputId="permission-fixture-file" showContext={false}
        labels={{ textarea: '主对话输入框', model: '模型', workspace: '空间',
          permission: '权限', submit: '发送', menu: '菜单', openMenu: '打开', closeMenu: '关闭' }}
        insertions={{ mode: '', skill: '', connector: '' }} />
    </main>
    <PermissionPromptHost api={api} />
  </LocalizationProvider>
)
