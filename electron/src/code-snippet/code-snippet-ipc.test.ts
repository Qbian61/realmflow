import { describe, expect, it, vi } from 'vitest'
import { IPC_COMMAND_CHANNELS } from '../../../shared/ipc-contract'
import { registerCodeSnippetIpc } from './code-snippet-ipc'

describe('code snippet IPC', () => {
  it('validates snippets before forwarding run and save commands', async () => {
    const handlers = new Map<
      string,
      (event: unknown, value: unknown) => unknown
    >()
    const service = {
      run: vi.fn().mockResolvedValue({ exitCode: 0 }),
      save: vi.fn().mockResolvedValue('/tmp/snippet.js')
    }
    registerCodeSnippetIpc({
      service,
      ipcMain: {
        handle: (channel, handler) => handlers.set(channel, handler)
      }
    })
    const snippet = {
      language: 'javascript',
      content: 'console.log("ready")',
      suggestedName: 'snippet.js'
    }

    await handlers.get(IPC_COMMAND_CHANNELS.codeSnippetRun)?.({}, snippet)
    await handlers.get(IPC_COMMAND_CHANNELS.codeSnippetSave)?.({}, snippet)
    expect(service.run).toHaveBeenCalledWith(snippet)
    expect(service.save).toHaveBeenCalledWith(snippet)

    expect(() =>
      handlers.get(IPC_COMMAND_CHANNELS.codeSnippetRun)?.(
        {},
        { ...snippet, command: 'rm -rf /' }
      )
    ).toThrow(
      `Invalid IPC payload for ${IPC_COMMAND_CHANNELS.codeSnippetRun}: snippet`
    )
  })
})
