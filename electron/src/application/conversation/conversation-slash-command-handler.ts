import { parseConversationSlashCommand } from '../../../../domain/conversation-input'
import type { ConversationProcessingSnapshot } from '../../../../domain/conversation-processor'

export type ConversationSlashCommandEffect =
  | { kind: 'none' }
  | { kind: 'new_context' }
  | { kind: 'compact_history' }
  | { kind: 'retry_last_turn' }
  | {
      kind: 'set_reasoning'
      level: 'auto' | 'low' | 'medium' | 'high'
    }

export type ConversationSlashCommandExecution =
  | {
      handled: true
      content: string
      command: string
      effect: ConversationSlashCommandEffect
    }
  | {
      handled: false
      prompt: string
      command: string
    }

type ConversationHistoryMessage = {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  status: 'pending' | 'completed' | 'failed'
}

export function applyConversationHistoryCommands<
  T extends ConversationHistoryMessage
>(messages: readonly T[]): {
  messages: T[]
  reasoning?: 'auto' | 'low' | 'medium' | 'high'
  compactedContext?: string
} {
  let startIndex = 0
  let reasoning: 'auto' | 'low' | 'medium' | 'high' | undefined
  let compactedContext: string | undefined
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index]
    if (message?.role !== 'user' || message.status !== 'completed') continue
    const parsed = parseConversationSlashCommand(message.content)
    if (parsed.outcome !== 'command' || parsed.command.kind !== 'system') {
      continue
    }
    if (parsed.command.name === 'reasoning') {
      reasoning = parsed.command.arguments.level
      continue
    }
    if (parsed.command.name === 'new') {
      startIndex = Math.min(messages.length, index + 2)
      compactedContext = undefined
      continue
    }
    if (parsed.command.name === 'compact') {
      compactedContext = compactHistory(messages.slice(startIndex, index))
      startIndex = Math.min(messages.length, index + 2)
    }
  }
  return {
    messages: messages.slice(startIndex),
    ...(reasoning ? { reasoning } : {}),
    ...(compactedContext ? { compactedContext } : {})
  }
}

export class ConversationSlashCommandHandler {
  async execute(input: {
    rawCommand: string
    processing: ConversationProcessingSnapshot
  }): Promise<ConversationSlashCommandExecution> {
    const parsed = parseConversationSlashCommand(input.rawCommand)
    if (parsed.outcome === 'not_command') {
      return {
        handled: false,
        prompt: input.processing.normalizedText,
        command: ''
      }
    }
    if (parsed.outcome === 'error') {
      return {
        handled: true,
        content: parsed.message,
        command: input.processing.slashCommand?.name ?? '',
        effect: { kind: 'none' }
      }
    }
    const { command } = parsed
    if (command.kind === 'prompt') {
      return {
        handled: false,
        prompt: `请审查 ${command.arguments.prompt}`,
        command: command.name
      }
    }
    if (command.name === 'context') {
      return {
        handled: true,
        content: contextSnapshotSummary(input.processing),
        command: command.name,
        effect: { kind: 'none' }
      }
    }
    if (command.name === 'new') {
      return {
        handled: true,
        content: '已从下一条消息开始使用新的上下文。',
        command: command.name,
        effect: { kind: 'new_context' }
      }
    }
    if (command.name === 'compact') {
      return {
        handled: true,
        content: '已压缩当前对话历史，原始消息仍保留在本地。',
        command: command.name,
        effect: { kind: 'compact_history' }
      }
    }
    if (command.name === 'retry') {
      return {
        handled: true,
        content: '已登记重试请求，请使用上一条回答的重试操作继续。',
        command: command.name,
        effect: { kind: 'retry_last_turn' }
      }
    }
    return {
      handled: true,
      content: `后续消息的推理模式已切换为 ${command.arguments.level}。`,
      command: command.name,
      effect: {
        kind: 'set_reasoning',
        level: command.arguments.level
      }
    }
  }
}

function compactHistory(messages: readonly ConversationHistoryMessage[]): string {
  const content = messages
    .filter(({ status, content }) => status === 'completed' && content.trim())
    .map(({ role, content }) => `${role}: ${content.replace(/\s+/g, ' ').trim()}`)
    .join('\n')
  const bounded =
    content.length <= 2_000
      ? content
      : `${content.slice(0, 1_999).trimEnd()}…`
  return bounded ? `## 已压缩的对话历史\n${bounded}` : ''
}

function contextSnapshotSummary(
  processing: ConversationProcessingSnapshot
): string {
  const references = processing.registeredInputs.references.length
  const attachments = processing.registeredInputs.attachmentPaths.length
  const retrievalQueries =
    processing.contextEnvelope.retrievalQueries.length
  const knowledge = processing.knowledgeContext
    ? processing.knowledgeContext.insufficientKnowledge
      ? '知识证据不足'
      : `${processing.knowledgeContext.allowedReferenceIds.length} 条知识引用`
    : '未使用知识检索'
  return [
    '上下文快照',
    `- Pipeline: ${processing.pipelineVersion}`,
    `- 稳定引用: ${references}`,
    `- 附件: ${attachments}`,
    `- 检索查询: ${retrievalQueries}`,
    `- 知识状态: ${knowledge}`
  ].join('\n')
}
