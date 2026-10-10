import { readdir, realpath, rm, stat } from 'node:fs/promises'
import { basename, extname, isAbsolute, join, resolve } from 'node:path'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type { ConversationGeneratedArtifactSource } from '../../../../domain/follow-up-suggestion'

type ToolSnapshot = {
  cwd?: string
  files: Set<string>
}

type RunState = {
  temporary: Set<string>
  final: Set<string>
}

export type GeneratedArtifactRunState = { temporary: string[]; final: string[] }
export type GeneratedArtifactStateStore = {
  read(runId: string): GeneratedArtifactRunState | undefined
  write(runId: string, state: GeneratedArtifactRunState): void
}

export type ToolExecutionArtifactSnapshot = ToolSnapshot | undefined

export class ConversationGeneratedArtifactService {
  private readonly runs = new Map<string, RunState>()
  private readonly operations = new Map<string, Promise<unknown>>()

  constructor(private readonly store?: GeneratedArtifactStateStore) {}

  async beforeToolExecution(input: {
    runId?: string
    toolName: string
    arguments: JsonObject
    scopeRoots: readonly string[]
  }): Promise<ToolExecutionArtifactSnapshot> {
    if (!input.runId || input.toolName !== 'process.run') return undefined
    const cwd = await resolveProcessCwd(input.scopeRoots, input.arguments)
    if (!cwd) return undefined
    return { cwd, files: await listFiles(cwd) }
  }

  async afterToolExecution(input: {
    runId?: string
    toolName: string
    arguments: JsonObject
    scopeRoots: readonly string[]
    snapshot?: ToolExecutionArtifactSnapshot
    output?: JsonObject
  }): Promise<void> {
    if (!input.runId) return
    const runId = input.runId
    return this.serialize(runId, async () => {
      const state = this.state(runId)
      for (const path of await resolveFinalArtifactPaths(input, state)) {
        state.final.add(path)
      }
      if (input.toolName === 'process.run' && input.snapshot?.cwd) {
        const after = await listFiles(input.snapshot.cwd)
        for (const path of after) {
          if (!input.snapshot.files.has(path) && !state.final.has(path)) {
            state.temporary.add(path)
          }
        }
      }
      this.save(runId, state)
    })
  }

  async finalizeRun(input: {
    runId: string
    conversationId?: string
    assistantMessageId?: string
    status: 'completed' | 'failed' | 'cancelled'
  }): Promise<ConversationGeneratedArtifactSource | undefined> {
    return this.serialize(input.runId, async () => {
      const state = this.state(input.runId)
      if (input.status === 'completed') {
        await Promise.all(
          [...state.temporary]
            .filter((path) => !state.final.has(path))
            .map((path) => rm(path, { force: true }))
        )
        state.temporary.clear()
      }
      const generatedArtifacts = await Promise.all(
        [...state.final].map(toGeneratedArtifact)
      )
      const existing = generatedArtifacts.filter(
        (artifact): artifact is NonNullable<typeof artifact> => Boolean(artifact)
      )
      state.final = new Set(existing.map((artifact) => artifact.path))
      this.save(input.runId, state)
      return existing.length > 0
        ? { schemaVersion: 1, generatedArtifacts: existing }
        : undefined
    })
  }

  private state(runId: string): RunState {
    if (this.store) {
      const saved = this.store.read(runId)
      return { temporary: new Set(saved?.temporary), final: new Set(saved?.final) }
    }
    const existing = this.runs.get(runId)
    if (existing) return existing
    const created = { temporary: new Set<string>(), final: new Set<string>() }
    this.runs.set(runId, created)
    return created
  }

  private save(runId: string, state: RunState): void {
    if (this.store) this.store.write(runId, { temporary: [...state.temporary], final: [...state.final] })
    else this.runs.set(runId, state)
  }

  private serialize<T>(runId: string, operation: () => Promise<T>): Promise<T> {
    const current = (this.operations.get(runId) ?? Promise.resolve()).then(operation, operation)
    this.operations.set(runId, current)
    const clear = () => { if (this.operations.get(runId) === current) this.operations.delete(runId) }
    void current.then(clear, clear)
    return current
  }
}

async function resolveProcessCwd(
  scopeRoots: readonly string[],
  input: JsonObject
): Promise<string | undefined> {
  const root = scopeRoots[0]
  if (!root) return undefined
  const cwd = typeof input.cwd === 'string' && input.cwd.length > 0
    ? input.cwd
    : '.'
  const candidate = isAbsolute(cwd) ? cwd : resolve(root, cwd)
  const resolvedRoot = await realpath(root)
  const resolvedCwd = await realpath(candidate)
  return isInside(resolvedRoot, resolvedCwd) ? resolvedCwd : undefined
}

async function resolveFinalArtifactPaths(input: {
  toolName: string
  arguments: JsonObject
  output?: JsonObject
  scopeRoots: readonly string[]
}, state: RunState): Promise<string[]> {
  const declaredValues = new Set<string>()
  collectPathValues(input.arguments.artifactPaths, declaredValues)
  const outputValues = new Set<string>()
  for (const key of ['path', 'filePath', 'outputPath', 'targetPath', 'pdfPath']) {
    collectPathValues(input.output?.[key], outputValues)
  }
  const root = input.scopeRoots[0] ? await realpath(input.scopeRoots[0]) : undefined
  const resolved: string[] = []
  for (const value of declaredValues) {
    const candidate = isAbsolute(value) ? value : root ? resolve(root, value) : undefined
    if (!candidate) continue
    try {
      const path = await realpath(candidate)
      if (!root || isInside(root, path)) resolved.push(path)
    } catch {
      // Nonexistent outputs are ignored; only real files become artifacts.
    }
  }
  for (const value of outputValues) {
    const candidate = isAbsolute(value) ? value : root ? resolve(root, value) : undefined
    if (!candidate) continue
    try {
      const path = await realpath(candidate)
      if (!root || !isInside(root, path)) continue
      if (isArtifactProducingTool(input.toolName)) {
        resolved.push(path)
      } else if (
        isReadVerificationTool(input.toolName) &&
        state.temporary.has(path) &&
        isDeliverableArtifactPath(path)
      ) {
        resolved.push(path)
      }
    } catch {
      // Nonexistent outputs are ignored; only real files become artifacts.
    }
  }
  return [...new Set(resolved)]
}

function collectPathValues(value: unknown, values: Set<string>): void {
  if (typeof value === 'string' && value.trim()) {
    values.add(value)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectPathValues(item, values)
  }
}

async function listFiles(directory: string): Promise<Set<string>> {
  const files = new Set<string>()
  const entries = await readdir(directory, { withFileTypes: true })
  await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        for (const child of await listFiles(path)) files.add(child)
        return
      }
      if (entry.isFile()) {
        files.add(await realpath(path))
      }
    })
  )
  return files
}

async function toGeneratedArtifact(path: string) {
  try {
    const info = await stat(path)
    if (!info.isFile()) return undefined
    return {
      path,
      name: basename(path),
      mediaType: mediaTypeForPath(path),
      sizeBytes: info.size,
      kind: artifactKind(path)
    }
  } catch {
    return undefined
  }
}

function mediaTypeForPath(path: string): string {
  switch (extname(path).toLowerCase()) {
    case '.pdf':
      return 'application/pdf'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.html':
      return 'text/html'
    case '.md':
      return 'text/markdown'
    case '.txt':
      return 'text/plain'
    default:
      return 'application/octet-stream'
  }
}

function artifactKind(path: string): string {
  const extension = extname(path).toLowerCase().replace(/^\./, '')
  return extension || 'file'
}

function isArtifactProducingTool(toolName: string): boolean {
  return (
    /^(?:document|documents?|office)\.(?:create|export|export_pdf|save)/.test(
      toolName
    ) ||
    [
      'image_generate',
      'video_generate',
      'music_generate',
      'tts'
    ].includes(toolName)
  )
}

function isReadVerificationTool(toolName: string): boolean {
  return /(?:^|\.)(inspect|read)$/.test(toolName)
}

function isDeliverableArtifactPath(path: string): boolean {
  const extension = extname(path).toLowerCase()
  if (!['.pdf', '.docx', '.xlsx', '.pptx', '.html', '.md'].includes(extension)) {
    return false
  }
  const name = basename(path, extension).toLowerCase()
  return !/^(?:cjk|probe|smoke|test|debug|tmp|temp|scratch|fontinfo|wrap|conv\d*|chrome)$/i.test(name)
}

function isInside(root: string, path: string): boolean {
  return path === root || path.startsWith(`${root}/`)
}
