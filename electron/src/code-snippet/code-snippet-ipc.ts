import { IPC_COMMAND_CHANNELS } from '../../../shared/ipc-contract'
import type { CodeSnippet } from '../../../shared/code-snippet'
import { requireString } from '../ipc/runtime-validation'
import type { CodeSnippetService } from './code-snippet-service'

type CodeSnippetCommands = Pick<CodeSnippetService, 'run' | 'save'>

export function registerCodeSnippetIpc({
  service,
  ipcMain
}: {
  service: CodeSnippetCommands
  ipcMain: {
    handle: (
      channel: string,
      handler: (event: unknown, value: unknown) => unknown
    ) => void
  }
}): void {
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.codeSnippetRun,
    (_event, value) =>
      service.run(
        requireCodeSnippet(value, IPC_COMMAND_CHANNELS.codeSnippetRun)
      )
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.codeSnippetSave,
    (_event, value) =>
      service.save(
        requireCodeSnippet(value, IPC_COMMAND_CHANNELS.codeSnippetSave)
      )
  )
}

function requireCodeSnippet(value: unknown, channel: string): CodeSnippet {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid IPC payload for ${channel}: snippet`)
  }
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  if (
    keys.some(
      (key) => !['language', 'content', 'suggestedName'].includes(key)
    )
  ) {
    throw new Error(`Invalid IPC payload for ${channel}: snippet`)
  }
  return {
    language: requireString(record.language, channel, 'snippet.language', {
      maxLength: 40
    }),
    content: requireString(record.content, channel, 'snippet.content', {
      allowEmpty: true,
      maxLength: 256 * 1024
    }),
    suggestedName: requireString(
      record.suggestedName,
      channel,
      'snippet.suggestedName',
      { maxLength: 180 }
    )
  }
}
