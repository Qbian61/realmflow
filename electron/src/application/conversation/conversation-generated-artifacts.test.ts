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

  it('retains artifact provenance across a service restart and repeated finalization', async () => {
    const states = new Map()
    const store = {
      read: (id: string) => structuredClone(states.get(id)),
      write: (id: string, value: unknown) => { states.set(id, structuredClone(value)) }
    }
    service = new ConversationGeneratedArtifactService(store)
    await writeFile(join(workspace, 'final.pdf'), 'final')
    await service.afterToolExecution({
      runId: 'run-1', toolName: 'document.create', arguments: {},
      scopeRoots: [workspace], output: { path: 'final.pdf' }
    })
    const restarted = new ConversationGeneratedArtifactService(store)
    const first = await restarted.finalizeRun({ runId: 'run-1', status: 'completed' })
    expect(first?.generatedArtifacts).toEqual([expect.objectContaining({ name: 'final.pdf' })])
    const retried = await new ConversationGeneratedArtifactService(store)
      .finalizeRun({ runId: 'run-1', status: 'completed' })
    expect(retried).toEqual(first)
  })

  it('registers canonical media outputs as final conversation artifacts', async () => {
    await writeFile(join(workspace, 'generated.png'), 'png')

    await service.afterToolExecution({
      runId: 'run-media',
      toolName: 'image_generate',
      arguments: { prompt: 'local image' },
      scopeRoots: [workspace],
      output: { path: 'generated.png', mediaType: 'image/png' }
    })

    expect(
      (await service.finalizeRun({
        runId: 'run-media',
        status: 'completed'
      }))?.generatedArtifacts
    ).toEqual([
      expect.objectContaining({
        name: 'generated.png',
        kind: 'png',
        mediaType: 'image/png'
      })
    ])
  })

  it('preserves all outputs when tools finish concurrently in one run', async () => {
    const states = new Map()
    const store = {
      read: (id: string) => structuredClone(states.get(id)),
      write: (id: string, value: unknown) => { states.set(id, structuredClone(value)) }
    }
    service = new ConversationGeneratedArtifactService(store)
    await writeFile(join(workspace, 'one.pdf'), 'one')
    await writeFile(join(workspace, 'two.pdf'), 'two')
    await Promise.all(['one.pdf', 'two.pdf'].map((path) => service.afterToolExecution({
      runId: 'run-1', toolName: 'document.create', arguments: {}, scopeRoots: [workspace], output: { path }
    })))
    const output = await new ConversationGeneratedArtifactService(store).finalizeRun({ runId: 'run-1', status: 'completed' })
    expect(output?.generatedArtifacts.map((item) => item.name).sort()).toEqual(['one.pdf', 'two.pdf'])
  })

  it('does not lose artifact provenance when a state write fails', async () => {
    let fail = true
    const states = new Map()
    const store = {
      read: (id: string) => structuredClone(states.get(id)),
      write: (id: string, value: unknown) => {
        if (fail) throw new Error('artifact store unavailable')
        states.set(id, structuredClone(value))
      }
    }
    service = new ConversationGeneratedArtifactService(store)
    await writeFile(join(workspace, 'final.pdf'), 'final')
    const input = {
      runId: 'run-1', toolName: 'document.create', arguments: {},
      scopeRoots: [workspace], output: { path: 'final.pdf' }
    }
    await expect(service.afterToolExecution(input)).rejects.toThrow('artifact store unavailable')
    fail = false
    await service.afterToolExecution(input)
    expect((await new ConversationGeneratedArtifactService(store)
      .finalizeRun({ runId: 'run-1', status: 'completed' }))?.generatedArtifacts).toHaveLength(1)
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
