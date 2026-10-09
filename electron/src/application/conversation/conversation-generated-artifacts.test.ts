import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ConversationGeneratedArtifactService } from './conversation-generated-artifacts'

describe('ConversationGeneratedArtifactService', () => {
  let directory: string
  let workspace: string
  let service: ConversationGeneratedArtifactService

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'realmflow-conversation-artifacts-'))
    workspace = join(directory, 'workspace')
    await mkdir(workspace, { recursive: true })
    service = new ConversationGeneratedArtifactService()
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('cleans files created by a completed process run while keeping declared artifacts', async () => {
    await writeFile(join(workspace, 'existing.log'), 'keep')
    const snapshot = await service.beforeToolExecution({
      runId: 'run-1',
      toolName: 'process.run',
      arguments: { cwd: '.', artifactPaths: ['final.pdf'] },
      scopeRoots: [workspace]
    })
    await writeFile(join(workspace, 'scratch.err'), 'temporary')
    await writeFile(join(workspace, 'final.pdf'), '%PDF-1.7')

    await service.afterToolExecution({
      runId: 'run-1',
      toolName: 'process.run',
      arguments: { cwd: '.', artifactPaths: ['final.pdf'] },
      scopeRoots: [workspace],
      snapshot,
      output: { exitCode: 0 }
    })
    const finalized = await service.finalizeRun({
      runId: 'run-1',
      status: 'completed'
    })

    expect(finalized).toBeDefined()
    await expect(stat(join(workspace, 'scratch.err'))).rejects.toThrow()
    await expect(readFile(join(workspace, 'existing.log'), 'utf8')).resolves.toBe('keep')
    await expect(readFile(join(workspace, 'final.pdf'), 'utf8')).resolves.toBe('%PDF-1.7')
    const finalPath = await realpath(join(workspace, 'final.pdf'))
    expect(finalized!.generatedArtifacts).toEqual([
      expect.objectContaining({
        path: finalPath,
        name: 'final.pdf',
        kind: 'pdf',
        mediaType: 'application/pdf',
        sizeBytes: 8
      })
    ])
  })

  it('keeps process-created files for failed runs', async () => {
    const snapshot = await service.beforeToolExecution({
      runId: 'run-1',
      toolName: 'process.run',
      arguments: { cwd: '.' },
      scopeRoots: [workspace]
    })
    await writeFile(join(workspace, 'debug.log'), 'debug')

    await service.afterToolExecution({
      runId: 'run-1',
      toolName: 'process.run',
      arguments: { cwd: '.' },
      scopeRoots: [workspace],
      snapshot,
      output: { exitCode: 1 }
    })
    await service.finalizeRun({ runId: 'run-1', status: 'failed' })

    await expect(readFile(join(workspace, 'debug.log'), 'utf8')).resolves.toBe('debug')
  })

  it('promotes verified deliverables while cleaning process probes', async () => {
    const snapshot = await service.beforeToolExecution({
      runId: 'run-1',
      toolName: 'process.run',
      arguments: { cwd: '.' },
      scopeRoots: [workspace]
    })
    await writeFile(join(workspace, 'cjk.pdf'), 'probe')
    await writeFile(join(workspace, 'resume-optimized.pdf'), 'final')
    await writeFile(join(workspace, 'resume-optimized.txt'), 'draft')

    await service.afterToolExecution({
      runId: 'run-1',
      toolName: 'process.run',
      arguments: { cwd: '.' },
      scopeRoots: [workspace],
      snapshot,
      output: { exitCode: 0 }
    })
    await service.afterToolExecution({
      runId: 'run-1',
      toolName: 'pdf.inspect',
      arguments: { path: 'cjk.pdf' },
      scopeRoots: [workspace],
      output: { path: 'cjk.pdf' }
    })
    await service.afterToolExecution({
      runId: 'run-1',
      toolName: 'pdf.inspect',
      arguments: { path: 'resume-optimized.pdf' },
      scopeRoots: [workspace],
      output: { path: 'resume-optimized.pdf' }
    })

    const finalized = await service.finalizeRun({
      runId: 'run-1',
      status: 'completed'
    })

    await expect(stat(join(workspace, 'cjk.pdf'))).rejects.toThrow()
    await expect(stat(join(workspace, 'resume-optimized.txt'))).rejects.toThrow()
    await expect(readFile(join(workspace, 'resume-optimized.pdf'), 'utf8')).resolves.toBe('final')
    expect(finalized?.generatedArtifacts).toEqual([
      expect.objectContaining({ name: 'resume-optimized.pdf', kind: 'pdf' })
    ])
  })
})
