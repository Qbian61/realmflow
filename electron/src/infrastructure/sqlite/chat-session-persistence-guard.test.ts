import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('chat session persistence architecture', () => {
  it('never replaces all messages during an ordinary session save', () => {
    const source = readFileSync(
      resolve('electron/src/infrastructure/sqlite/repositories.ts'),
      'utf8'
    )
    const repositoryStart = source.indexOf(
      'export class SqliteChatSessionRepository'
    )
    const repositoryEnd = source.indexOf(
      'export class SqliteArtifactMetadataRepository',
      repositoryStart
    )
    const repositorySource = source.slice(repositoryStart, repositoryEnd)

    expect(repositoryStart).toBeGreaterThanOrEqual(0)
    expect(repositoryEnd).toBeGreaterThan(repositoryStart)
    expect(repositorySource).not.toMatch(
      /DELETE\s+FROM\s+chat_messages\s+WHERE\s+session_id\s*=\s*\?/i
    )
  })
})
