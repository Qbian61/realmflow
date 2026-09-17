import { createHash } from 'node:crypto'
import {
  copyFile,
  mkdir,
  readFile,
  rm,
  stat
} from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import type Database from 'better-sqlite3'
import { isRequirementStageId } from '../../../../domain/requirement'

const IMPORT_KEY = 'legacy-json-v1'

type LegacySnapshot = {
  revision: number
  value: unknown
}

type LegacyStore = Partial<
  Record<
    'workspaceNavigation' | 'chatSessions' | 'spaceResources',
    LegacySnapshot
  >
>

type Workspace = {
  id: string
  path: string
  label: string
  description: string
  sortOrder: number
}

type Requirement = {
  id: string
  workspaceId: string
  title: string
  stage?: string
  status: string
  updatedAt: number
  sortOrder: number
  workspaceRootPath?: string
}

type ChatSession = {
  id: string
  workspaceId: string
  title: string
  createdAt: number
  updatedAt: number
  sortOrder: number
  messages: Array<{
    id: string
    role: string
    content: string
    createdAt: number
    sortOrder: number
  }>
}

type SpaceResource = {
  id: string
  workspaceId: string
  name: string
  type: string
  locator: string
  detail: string
  updatedAt: number
  sortOrder: number
}

type Artifact = {
  id: string
  requirementId: string
  stageId: string
  relativePath: string
  kind: string
  checksum: string
  byteSize: number
  isPrimary: boolean
  version: number
  sourceManifestPath: string
  sourceManifestContent: string
}

type ParsedLegacyData = {
  workspaces: Workspace[]
  requirements: Requirement[]
  chatSessions: ChatSession[]
  spaceResources: SpaceResource[]
  artifacts: Artifact[]
  revisions: Array<{ dataset: string; revision: number }>
  rawRendererState?: string
  rawBindings?: string
}

export type LegacyMigrationDiagnostic = {
  source: string
  path: string
  message: string
}

export type LegacyMigrationReport = {
  status: 'imported' | 'already-imported'
  counts: {
    workspaces: number
    requirements: number
    chatSessions: number
    chatMessages: number
    spaceResources: number
    artifacts: number
  }
  diagnostics: LegacyMigrationDiagnostic[]
  backupPath?: string
}

export class LegacyMigrationError extends Error {
  constructor(
    message: string,
    readonly diagnostics: LegacyMigrationDiagnostic[]
  ) {
    super(message)
    this.name = 'LegacyMigrationError'
  }
}

type LegacyDataMigratorOptions = {
  rendererStatePath: string
  bindingsPath: string
  backupDirectory: string
  now?: () => number
}

export class LegacyDataMigrator {
  private readonly now: () => number

  constructor(
    private readonly database: Database.Database,
    private readonly options: LegacyDataMigratorOptions
  ) {
    this.now = options.now ?? Date.now
  }

  async migrate(): Promise<LegacyMigrationReport> {
    const existing = this.database
      .prepare('SELECT report_json FROM legacy_imports WHERE source_key = ?')
      .get(IMPORT_KEY) as { report_json: string } | undefined
    if (existing) {
      const report = JSON.parse(existing.report_json) as LegacyMigrationReport
      return { ...report, status: 'already-imported' }
    }

    const diagnostics: LegacyMigrationDiagnostic[] = []
    const parsed = await this.parseSources(diagnostics)
    if (diagnostics.length > 0) {
      throw new LegacyMigrationError(
        'Legacy data validation failed',
        diagnostics
      )
    }

    const timestamp = this.now()
    const backupPath = join(
      this.options.backupDirectory,
      `legacy-${timestamp}`
    )
    await this.createBackup(parsed, backupPath)
    const counts = {
      workspaces: parsed.workspaces.length,
      requirements: parsed.requirements.length,
      chatSessions: parsed.chatSessions.length,
      chatMessages: parsed.chatSessions.reduce(
        (count, session) => count + session.messages.length,
        0
      ),
      spaceResources: parsed.spaceResources.length,
      artifacts: parsed.artifacts.length
    }
    const report: LegacyMigrationReport = {
      status: 'imported',
      counts,
      diagnostics: [],
      backupPath
    }
    const fingerprint = createHash('sha256')
      .update(parsed.rawRendererState ?? '')
      .update(parsed.rawBindings ?? '')
      .update(parsed.artifacts.map((item) => item.sourceManifestContent).join(''))
      .digest('hex')

    try {
      this.database.transaction(() => {
        this.importData(parsed, timestamp)
        this.verifyCounts(counts)
        this.database
          .prepare(
            `INSERT INTO legacy_imports (
              source_key, source_fingerprint, backup_path, imported_at, report_json
            ) VALUES (?, ?, ?, ?, ?)`
          )
          .run(
            IMPORT_KEY,
            fingerprint,
            backupPath,
            timestamp,
            JSON.stringify(report)
          )
      })()
    } catch (error) {
      await rm(backupPath, { recursive: true, force: true })
      if (error instanceof LegacyMigrationError) throw error
      throw new LegacyMigrationError('Legacy data import failed', [
        diagnostic(
          'realmflow.db',
          'transaction',
          `Import rolled back: ${errorMessage(error)}`
        )
      ])
    }
    return report
  }

  private async parseSources(
    diagnostics: LegacyMigrationDiagnostic[]
  ): Promise<ParsedLegacyData> {
    const rawRendererState = await readOptional(this.options.rendererStatePath)
    const rawBindings = await readOptional(this.options.bindingsPath)
    const store = this.parseStore(rawRendererState, diagnostics)
    const bindings = this.parseBindings(rawBindings, diagnostics)
    const workspaces: Workspace[] = []
    const requirements: Requirement[] = []
    const chatSessions: ChatSession[] = []
    const spaceResources: SpaceResource[] = []
    const artifacts: Artifact[] = []
    const workspaceIds = new Map<string, string>()
    const requirementIds = new Set<string>()

    const navigation = store.workspaceNavigation
      ? validateRecord(
          store.workspaceNavigation.value,
          diagnostics,
          'renderer-state.json',
          'workspaceNavigation.value'
        )
      : undefined
    if (navigation) {
      if (navigation.version !== 1 || !Array.isArray(navigation.spaces)) {
        diagnostics.push(
          diagnostic(
            'renderer-state.json',
            'workspaceNavigation.value',
            'Expected workspace navigation version 1 with spaces'
          )
        )
      } else {
        navigation.spaces.forEach((value, index) => {
          const path = `workspaceNavigation.value.spaces[${index}]`
          const item = validateRecord(
            value,
            diagnostics,
            'renderer-state.json',
            path
          )
          if (
            !item ||
            typeof item.path !== 'string' ||
            !item.path.startsWith('/spaces/') ||
            typeof item.label !== 'string' ||
            typeof item.description !== 'string'
          ) {
            if (item) {
              diagnostics.push(
                diagnostic(
                  'renderer-state.json',
                  path,
                  'Invalid workspace record'
                )
              )
            }
            return
          }
          const id = stableId('workspace', item.path)
          workspaceIds.set(item.path, id)
          workspaces.push({
            id,
            path: item.path,
            label: item.label,
            description: item.description,
            sortOrder: index
          })
        })
      }

      const bySpace = validateRecord(
        navigation.requirementsBySpace,
        diagnostics,
        'renderer-state.json',
        'workspaceNavigation.value.requirementsBySpace'
      )
      if (bySpace) {
        for (const [spacePath, values] of Object.entries(bySpace)) {
          const workspaceId = workspaceIds.get(spacePath)
          if (!workspaceId || !Array.isArray(values)) {
            diagnostics.push(
              diagnostic(
                'renderer-state.json',
                `workspaceNavigation.value.requirementsBySpace.${spacePath}`,
                workspaceId
                  ? 'Requirements must be an array'
                  : 'Requirement references an unknown workspace'
              )
            )
            continue
          }
          values.forEach((value, index) => {
            const path =
              `workspaceNavigation.value.requirementsBySpace.` +
              `${spacePath}[${index}]`
            const item = validateRecord(
              value,
              diagnostics,
              'renderer-state.json',
              path
            )
            if (
              !item ||
              typeof item.id !== 'string' ||
              typeof item.title !== 'string' ||
              (item.stage !== undefined &&
                !isRequirementStageId(item.stage)) ||
              (item.status !== undefined &&
                !['pending', 'active', 'completed'].includes(
                  String(item.status)
                )) ||
              (item.updatedAt !== undefined &&
                typeof item.updatedAt !== 'number')
            ) {
              if (item) {
                diagnostics.push(
                  diagnostic(
                    'renderer-state.json',
                    path,
                    'Invalid requirement record'
                  )
                )
              }
              return
            }
            requirementIds.add(item.id)
            requirements.push({
              id: item.id,
              workspaceId,
              title: item.title,
              ...(isRequirementStageId(item.stage)
                ? { stage: item.stage }
                : {}),
              status:
                item.status === 'active' || item.status === 'completed'
                  ? item.status
                  : 'pending',
              updatedAt:
                typeof item.updatedAt === 'number' ? item.updatedAt : this.now(),
              sortOrder: index,
              ...(bindings[item.id]
                ? { workspaceRootPath: bindings[item.id] }
                : {})
            })
          })
        }
      }
    }

    this.parseChatSessions(
      store.chatSessions,
      workspaceIds,
      chatSessions,
      diagnostics
    )
    this.parseSpaceResources(
      store.spaceResources,
      workspaceIds,
      spaceResources,
      diagnostics
    )

    for (const [requirementId, rootPath] of Object.entries(bindings)) {
      if (!requirementIds.has(requirementId)) {
        diagnostics.push(
          diagnostic(
            'workspace-bindings.json',
            requirementId,
            'Binding references an unknown requirement'
          )
        )
        continue
      }
      artifacts.push(
        ...(await this.readManifestArtifacts(
          requirementId,
          rootPath,
          diagnostics
        ))
      )
    }

    const revisions: Array<{ dataset: string; revision: number }> = []
    for (const [dataset, revision] of [
      ['workspaceNavigation', store.workspaceNavigation?.revision],
      ['chatSessions', store.chatSessions?.revision],
      ['spaceResources', store.spaceResources?.revision]
    ] as const) {
      if (revision !== undefined) revisions.push({ dataset, revision })
    }

    return {
      workspaces,
      requirements,
      chatSessions,
      spaceResources,
      artifacts,
      revisions,
      ...(rawRendererState !== undefined ? { rawRendererState } : {}),
      ...(rawBindings !== undefined ? { rawBindings } : {})
    }
  }

  private parseStore(
    raw: string | undefined,
    diagnostics: LegacyMigrationDiagnostic[]
  ): LegacyStore {
    if (raw === undefined) return {}
    const parsed = parseJson(
      raw,
      diagnostics,
      'renderer-state.json'
    )
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      if (parsed !== undefined) {
        diagnostics.push(
          diagnostic(
            'renderer-state.json',
            '$',
            'Expected an object containing dataset snapshots'
          )
        )
      }
      return {}
    }
    const result: LegacyStore = {}
    for (const dataset of [
      'workspaceNavigation',
      'chatSessions',
      'spaceResources'
    ] as const) {
      const value = (parsed as Record<string, unknown>)[dataset]
      if (value === undefined) continue
      if (
        !value ||
        typeof value !== 'object' ||
        Array.isArray(value) ||
        !('revision' in value) ||
        !Number.isSafeInteger(value.revision) ||
        Number(value.revision) < 0 ||
        !('value' in value)
      ) {
        diagnostics.push(
          diagnostic(
            'renderer-state.json',
            dataset,
            'Invalid versioned snapshot'
          )
        )
        continue
      }
      result[dataset] = {
        revision: Number(value.revision),
        value: value.value
      }
    }
    return result
  }

  private parseBindings(
    raw: string | undefined,
    diagnostics: LegacyMigrationDiagnostic[]
  ): Record<string, string> {
    if (raw === undefined) return {}
    const parsed = parseJson(raw, diagnostics, 'workspace-bindings.json')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      if (parsed !== undefined) {
        diagnostics.push(
          diagnostic(
            'workspace-bindings.json',
            '$',
            'Expected a requirement-to-path object'
          )
        )
      }
      return {}
    }
    const result: Record<string, string> = {}
    for (const [requirementId, rootPath] of Object.entries(parsed)) {
      if (
        !/^[A-Za-z0-9._-]+$/.test(requirementId) ||
        typeof rootPath !== 'string'
      ) {
        diagnostics.push(
          diagnostic(
            'workspace-bindings.json',
            requirementId,
            'Invalid requirement binding'
          )
        )
        continue
      }
      result[requirementId] = rootPath
    }
    return result
  }

  private parseChatSessions(
    snapshot: LegacySnapshot | undefined,
    workspaceIds: Map<string, string>,
    output: ChatSession[],
    diagnostics: LegacyMigrationDiagnostic[]
  ): void {
    if (!snapshot) return
    const value = validateRecord(
      snapshot.value,
      diagnostics,
      'renderer-state.json',
      'chatSessions.value'
    )
    if (
      !value ||
      ![1, 2, 3, 4].includes(Number(value.version)) ||
      !Array.isArray(value.sessions)
    ) {
      if (value) {
        diagnostics.push(
          diagnostic(
            'renderer-state.json',
            'chatSessions.value',
            'Invalid chat session dataset'
          )
        )
      }
      return
    }
    value.sessions.forEach((candidate, index) => {
      const path = `chatSessions.value.sessions[${index}]`
      const item = validateRecord(
        candidate,
        diagnostics,
        'renderer-state.json',
        path
      )
      const workspaceId =
        item && typeof item.spacePath === 'string'
          ? workspaceIds.get(item.spacePath)
          : undefined
      if (
        !item ||
        typeof item.id !== 'string' ||
        typeof item.title !== 'string' ||
        !workspaceId ||
        typeof item.createdAt !== 'number' ||
        typeof item.updatedAt !== 'number' ||
        !Array.isArray(item.messages)
      ) {
        if (item) {
          diagnostics.push(
            diagnostic(
              'renderer-state.json',
              path,
              'Invalid chat session or unknown workspace'
            )
          )
        }
        return
      }
      const messages: ChatSession['messages'] = []
      item.messages.forEach((messageCandidate, messageIndex) => {
        const messagePath = `${path}.messages[${messageIndex}]`
        const message = validateRecord(
          messageCandidate,
          diagnostics,
          'renderer-state.json',
          messagePath
        )
        if (
          !message ||
          typeof message.id !== 'string' ||
          typeof message.content !== 'string' ||
          (message.role !== undefined &&
            message.role !== 'user' &&
            message.role !== 'assistant') ||
          typeof message.createdAt !== 'number'
        ) {
          if (message) {
            diagnostics.push(
              diagnostic(
                'renderer-state.json',
                messagePath,
                'Invalid chat message'
              )
            )
          }
          return
        }
        messages.push({
          id: message.id,
          role: message.role === 'assistant' ? 'assistant' : 'user',
          content: message.content,
          createdAt: message.createdAt,
          sortOrder: messageIndex
        })
      })
      output.push({
        id: item.id,
        workspaceId,
        title: item.title,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        sortOrder: index,
        messages
      })
    })
  }

  private parseSpaceResources(
    snapshot: LegacySnapshot | undefined,
    workspaceIds: Map<string, string>,
    output: SpaceResource[],
    diagnostics: LegacyMigrationDiagnostic[]
  ): void {
    if (!snapshot) return
    const value = validateRecord(
      snapshot.value,
      diagnostics,
      'renderer-state.json',
      'spaceResources.value'
    )
    const resourcesBySpace =
      value &&
      value.version === 1 &&
      value.resourcesBySpace &&
      typeof value.resourcesBySpace === 'object' &&
      !Array.isArray(value.resourcesBySpace)
        ? (value.resourcesBySpace as Record<string, unknown>)
        : undefined
    if (!resourcesBySpace) {
      if (value) {
        diagnostics.push(
          diagnostic(
            'renderer-state.json',
            'spaceResources.value',
            'Invalid space resource dataset'
          )
        )
      }
      return
    }
    for (const [spacePath, candidates] of Object.entries(resourcesBySpace)) {
      const workspaceId = workspaceIds.get(spacePath)
      if (!workspaceId || !Array.isArray(candidates)) {
        diagnostics.push(
          diagnostic(
            'renderer-state.json',
            `spaceResources.value.resourcesBySpace.${spacePath}`,
            'Invalid resources or unknown workspace'
          )
        )
        continue
      }
      candidates.forEach((candidate, index) => {
        const path =
          `spaceResources.value.resourcesBySpace.${spacePath}[${index}]`
        const item = validateRecord(
          candidate,
          diagnostics,
          'renderer-state.json',
          path
        )
        if (
          !item ||
          typeof item.id !== 'string' ||
          typeof item.name !== 'string' ||
          !['file', 'document', 'repository'].includes(String(item.type)) ||
          typeof item.locator !== 'string' ||
          typeof item.detail !== 'string' ||
          typeof item.updatedAt !== 'number'
        ) {
          if (item) {
            diagnostics.push(
              diagnostic(
                'renderer-state.json',
                path,
                'Invalid space resource'
              )
            )
          }
          return
        }
        output.push({
          id: item.id,
          workspaceId,
          name: item.name,
          type: String(item.type),
          locator: item.locator,
          detail: item.detail,
          updatedAt: item.updatedAt,
          sortOrder: index
        })
      })
    }
  }

  private async readManifestArtifacts(
    requirementId: string,
    rootPath: string,
    diagnostics: LegacyMigrationDiagnostic[]
  ): Promise<Artifact[]> {
    const manifestPath = join(rootPath, '.realmflow', 'requirement.json')
    const raw = await readOptional(manifestPath)
    if (raw === undefined) return []
    const parsed = parseJson(raw, diagnostics, manifestPath)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return []
    }
    const manifest = parsed as Record<string, unknown>
    if (
      manifest.version !== 1 ||
      manifest.requirementId !== requirementId ||
      !manifest.stages ||
      typeof manifest.stages !== 'object' ||
      Array.isArray(manifest.stages)
    ) {
      diagnostics.push(
        diagnostic(manifestPath, '$', 'Invalid requirement manifest')
      )
      return []
    }
    const output: Artifact[] = []
    for (const [stageId, stageCandidate] of Object.entries(
      manifest.stages as Record<string, unknown>
    )) {
      const stage = validateRecord(
        stageCandidate,
        diagnostics,
        manifestPath,
        `stages.${stageId}`
      )
      if (!isRequirementStageId(stageId) || !stage || !Array.isArray(stage.artifacts)) {
        if (stage) {
          diagnostics.push(
            diagnostic(manifestPath, `stages.${stageId}`, 'Invalid stage')
          )
        }
        continue
      }
      for (let index = 0; index < stage.artifacts.length; index += 1) {
        const candidate = validateRecord(
          stage.artifacts[index],
          diagnostics,
          manifestPath,
          `stages.${stageId}.artifacts[${index}]`
        )
        if (!candidate || !isSafeRelativePath(candidate.path)) {
          if (candidate) {
            diagnostics.push(
              diagnostic(
                manifestPath,
                `stages.${stageId}.artifacts[${index}]`,
                'Invalid artifact path'
              )
            )
          }
          continue
        }
        const artifactPath = resolve(rootPath, candidate.path)
        try {
          const content = await readFile(artifactPath)
          const fileStats = await stat(artifactPath)
          if (!fileStats.isFile()) throw new Error('Artifact is not a file')
          output.push({
            id: stableId(
              'artifact',
              `${requirementId}:${stageId}:${candidate.path}:1`
            ),
            requirementId,
            stageId,
            relativePath: candidate.path,
            kind: artifactKind(candidate.path),
            checksum: `sha256:${createHash('sha256')
              .update(content)
              .digest('hex')}`,
            byteSize: content.byteLength,
            isPrimary: candidate.primary === true,
            version: 1,
            sourceManifestPath: manifestPath,
            sourceManifestContent: raw
          })
        } catch (error) {
          diagnostics.push(
            diagnostic(
              manifestPath,
              `stages.${stageId}.artifacts[${index}]`,
              `Artifact cannot be read: ${errorMessage(error)}`
            )
          )
        }
      }
    }
    return output
  }

  private async createBackup(
    data: ParsedLegacyData,
    backupPath: string
  ): Promise<void> {
    await mkdir(backupPath, { recursive: true })
    if (data.rawRendererState !== undefined) {
      await copyFile(
        this.options.rendererStatePath,
        join(backupPath, 'renderer-state.json')
      )
    }
    if (data.rawBindings !== undefined) {
      await copyFile(
        this.options.bindingsPath,
        join(backupPath, 'workspace-bindings.json')
      )
    }
    const manifestDirectory = join(backupPath, 'manifests')
    const manifests = new Map(
      data.artifacts.map((artifact) => [
        artifact.requirementId,
        artifact.sourceManifestPath
      ])
    )
    if (manifests.size > 0) await mkdir(manifestDirectory, { recursive: true })
    for (const [requirementId, source] of manifests) {
      await copyFile(source, join(manifestDirectory, `${requirementId}.json`))
    }
  }

  private importData(data: ParsedLegacyData, timestamp: number): void {
    const insertWorkspace = this.database.prepare(
      `INSERT INTO workspaces (
        id, path, label, description, sort_order, revision, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
    )
    for (const item of data.workspaces) {
      insertWorkspace.run(
        item.id,
        item.path,
        item.label,
        item.description,
        item.sortOrder,
        timestamp,
        timestamp
      )
    }

    const insertRequirement = this.database.prepare(
      `INSERT INTO requirements (
        id, workspace_id, title, stage, status, body_relative_path,
        workspace_root_path, sort_order, revision, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    )
    for (const item of data.requirements) {
      insertRequirement.run(
        item.id,
        item.workspaceId,
        item.title,
        item.stage ?? null,
        item.status,
        'requirement.md',
        item.workspaceRootPath ?? null,
        item.sortOrder,
        item.updatedAt,
        item.updatedAt
      )
    }

    const insertSession = this.database.prepare(
      `INSERT INTO chat_sessions (
        id, workspace_id, title, sort_order, revision, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 1, ?, ?)`
    )
    const insertMessage = this.database.prepare(
      `INSERT INTO chat_messages (
        id, session_id, role, content, sort_order, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)`
    )
    for (const item of data.chatSessions) {
      insertSession.run(
        item.id,
        item.workspaceId,
        item.title,
        item.sortOrder,
        item.createdAt,
        item.updatedAt
      )
      for (const message of item.messages) {
        insertMessage.run(
          message.id,
          item.id,
          message.role,
          message.content,
          message.sortOrder,
          message.createdAt
        )
      }
    }

    const insertResource = this.database.prepare(
      `INSERT INTO space_resources (
        id, workspace_id, name, type, locator, detail, sort_order, revision,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    )
    for (const item of data.spaceResources) {
      insertResource.run(
        item.id,
        item.workspaceId,
        item.name,
        item.type,
        item.locator,
        item.detail,
        item.sortOrder,
        item.updatedAt,
        item.updatedAt
      )
    }

    const insertArtifact = this.database.prepare(
      `INSERT INTO artifacts (
        id, requirement_id, stage_id, relative_path, kind, checksum, version,
        byte_size, is_primary, revision, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    )
    for (const item of data.artifacts) {
      insertArtifact.run(
        item.id,
        item.requirementId,
        item.stageId,
        item.relativePath,
        item.kind,
        item.checksum,
        item.version,
        item.byteSize,
        item.isPrimary ? 1 : 0,
        timestamp,
        timestamp
      )
    }

    const upsertRevision = this.database.prepare(
      `INSERT INTO dataset_revisions (dataset, revision, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(dataset) DO UPDATE SET
         revision = excluded.revision,
         updated_at = excluded.updated_at`
    )
    for (const item of data.revisions) {
      upsertRevision.run(item.dataset, item.revision, timestamp)
    }
  }

  private verifyCounts(
    expected: LegacyMigrationReport['counts']
  ): void {
    const actual = {
      workspaces: count(this.database, 'workspaces'),
      requirements: count(this.database, 'requirements'),
      chatSessions: count(this.database, 'chat_sessions'),
      chatMessages: count(this.database, 'chat_messages'),
      spaceResources: count(this.database, 'space_resources'),
      artifacts: count(this.database, 'artifacts')
    }
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(
        `Legacy import count mismatch: expected ${JSON.stringify(
          expected
        )}, received ${JSON.stringify(actual)}`
      )
    }
    const dangling = this.database
      .prepare(
        `SELECT COUNT(*) FROM requirements r
         LEFT JOIN workspaces w ON w.id = r.workspace_id
         WHERE w.id IS NULL`
      )
      .pluck()
      .get() as number
    if (dangling !== 0) throw new Error('Legacy import has dangling relations')
  }
}

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

function parseJson(
  raw: string,
  diagnostics: LegacyMigrationDiagnostic[],
  source: string
): unknown {
  try {
    return JSON.parse(raw) as unknown
  } catch (error) {
    diagnostics.push(
      diagnostic(source, '$', `Invalid JSON: ${errorMessage(error)}`)
    )
    return undefined
  }
}

function validateRecord(
  value: unknown,
  diagnostics: LegacyMigrationDiagnostic[],
  source: string,
  path: string
): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    diagnostics.push(diagnostic(source, path, 'Expected an object'))
    return undefined
  }
  return value as Record<string, unknown>
}

function diagnostic(
  source: string,
  path: string,
  message: string
): LegacyMigrationDiagnostic {
  return { source: basename(source), path, message }
}

function stableId(namespace: string, value: string): string {
  return `legacy-${namespace}-${createHash('sha256')
    .update(value)
    .digest('hex')
    .slice(0, 20)}`
}

function isSafeRelativePath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !value.includes('\0') &&
    !value.startsWith('/') &&
    value !== '..' &&
    !value.startsWith('../') &&
    !value.includes('/../')
  )
}

function artifactKind(path: string): string {
  const extension = extname(path).toLowerCase()
  if (['.md', '.markdown', '.mdx'].includes(extension)) return 'markdown'
  if (['.htm', '.html'].includes(extension)) return 'html'
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif'].includes(extension)) {
    return 'image'
  }
  return 'file'
}

function count(database: Database.Database, table: string): number {
  return database.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get() as number
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
