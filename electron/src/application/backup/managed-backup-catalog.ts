import { lstat, readFile } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'
import type Database from 'better-sqlite3'
import {
  normalizeBackupRelativePath,
  type BackupEntryKind,
  type BackupSummary
} from '../../../../domain/backup'
import type { SecurePathService } from '../../workspace/secure-path-service'

export type ManagedBackupCatalogEntry = {
  kind: BackupEntryKind
  archivePath: string
  sourcePath: string
  sourceSize: number
  sourceMtimeMs: number
  expectedChecksum?: string
  workRootId?: string
  targetPath?: string
}

export type ManagedBackupCatalogResult = {
  entries: ManagedBackupCatalogEntry[]
  summary: BackupSummary
}

type WorkRootRow = {
  id: string
  path: string
}

type SpaceRow = {
  id: string
  root_path: string | null
  work_root_id: string | null
  work_root_path: string | null
  trash_path: string | null
}

type RequirementRow = {
  id: string
  workspace_id: string
  workspace_root_path: string | null
  work_root_id: string | null
  work_root_path: string | null
  space_root_path: string | null
  space_trash_path: string | null
  requirement_trash_path: string | null
}

type ArtifactRow = RequirementRow & {
  relative_path: string
  checksum: string
}

export class ManagedBackupCatalog {
  constructor(
    private readonly database: Database.Database,
    private readonly securePaths: SecurePathService
  ) {}

  async read(databasePath: string): Promise<ManagedBackupCatalogResult> {
    const roots = this.listWorkRoots()
    const spaces = this.listSpaces()
    const requirements = this.listRequirements()
    const artifacts = this.listArtifacts()
    const entries: ManagedBackupCatalogEntry[] = []
    let byteSize = 0

    byteSize += await this.addDatabaseEntry(entries, databasePath)

    for (const root of roots) {
      byteSize += await this.addManagedEntry(entries, {
        kind: 'root_manifest',
        root,
        sourcePath: join(root.path, '.realmflow', 'root.json'),
        targetPath: '.realmflow/root.json',
        identity: { key: 'rootId', value: root.id }
      })
    }
    for (const space of spaces) {
      const root = requireRoot(space)
      const targetDirectory = this.relativeTarget(root.path, space.root_path)
      const sourceDirectory = space.trash_path ?? space.root_path
      if (!sourceDirectory) {
        throw new Error('Managed backup path is unavailable')
      }
      byteSize += await this.addManagedEntry(entries, {
        kind: 'space_manifest',
        root,
        sourcePath: join(sourceDirectory, '.realmflow', 'space.json'),
        targetPath: `${targetDirectory}/.realmflow/space.json`,
        identity: { key: 'spaceId', value: space.id }
      })
    }
    for (const requirement of requirements) {
      const root = requireRoot(requirement)
      const targetDirectory = this.relativeTarget(
        root.path,
        requirement.workspace_root_path
      )
      const sourceDirectory = this.requirementSourceDirectory(requirement)
      byteSize += await this.addManagedEntry(entries, {
        kind: 'requirement_manifest',
        root,
        sourcePath: join(
          sourceDirectory,
          '.realmflow',
          'requirement.json'
        ),
        targetPath: `${targetDirectory}/.realmflow/requirement.json`,
        identity: { key: 'requirementId', value: requirement.id }
      })
    }
    for (const artifact of artifacts) {
      const root = requireRoot(artifact)
      const artifactPath = this.normalizeManagedPath(artifact.relative_path)
      const targetDirectory = this.relativeTarget(
        root.path,
        artifact.workspace_root_path
      )
      const sourceDirectory = this.requirementSourceDirectory(artifact)
      byteSize += await this.addManagedEntry(entries, {
        kind: 'formal_artifact',
        root,
        sourcePath: join(sourceDirectory, ...artifactPath.split('/')),
        targetPath: `${targetDirectory}/${artifactPath}`,
        expectedChecksum: artifact.checksum
      })
    }

    this.assertUniqueEntries(entries)
    return {
      entries,
      summary: {
        workRootCount: roots.length,
        spaceCount: spaces.length,
        requirementCount: requirements.length,
        formalArtifactCount: artifacts.length,
        fileCount: entries.length,
        byteSize
      }
    }
  }

  private listWorkRoots(): WorkRootRow[] {
    return this.database
      .prepare('SELECT id, path FROM work_roots ORDER BY id')
      .all() as WorkRootRow[]
  }

  private listSpaces(): SpaceRow[] {
    return this.database
      .prepare(
        `SELECT
          workspace.id,
          workspace.root_path,
          workspace.work_root_id,
          root.path AS work_root_path,
          deletion.trash_path
        FROM workspaces AS workspace
        LEFT JOIN work_roots AS root ON root.id = workspace.work_root_id
        LEFT JOIN entity_deletions AS deletion
          ON deletion.entity_type = 'workspace'
          AND deletion.entity_id = workspace.id
        ORDER BY workspace.id`
      )
      .all() as SpaceRow[]
  }

  private listRequirements(): RequirementRow[] {
    return this.database
      .prepare(
        `${requirementSelect()}
         ORDER BY requirement.id`
      )
      .all() as RequirementRow[]
  }

  private listArtifacts(): ArtifactRow[] {
    return this.database
      .prepare(
        `SELECT
          requirement.id,
          requirement.workspace_id,
          requirement.workspace_root_path,
          workspace.work_root_id,
          root.path AS work_root_path,
          workspace.root_path AS space_root_path,
          space_deletion.trash_path AS space_trash_path,
          requirement_deletion.trash_path AS requirement_trash_path,
          artifact.relative_path,
          artifact.checksum
         FROM artifacts AS artifact
         JOIN requirements AS requirement
           ON requirement.id = artifact.requirement_id
         JOIN workspaces AS workspace
           ON workspace.id = requirement.workspace_id
         LEFT JOIN work_roots AS root
           ON root.id = workspace.work_root_id
         LEFT JOIN entity_deletions AS space_deletion
           ON space_deletion.entity_type = 'workspace'
           AND space_deletion.entity_id = workspace.id
         LEFT JOIN entity_deletions AS requirement_deletion
           ON requirement_deletion.entity_type = 'requirement'
           AND requirement_deletion.entity_id = requirement.id
         WHERE artifact.is_primary = 1
           AND artifact.is_valid = 1
         ORDER BY requirement.id, artifact.relative_path, artifact.id`
      )
      .all() as ArtifactRow[]
  }

  private async addDatabaseEntry(
    entries: ManagedBackupCatalogEntry[],
    databasePath: string
  ): Promise<number> {
    const source = await lstat(databasePath)
    if (source.isSymbolicLink()) {
      throw new Error('Managed backup source cannot be a symbolic link')
    }
    if (!source.isFile()) {
      throw new Error('Managed backup source is not a file')
    }
    entries.push({
      kind: 'database',
      archivePath: 'database/realmflow.db',
      sourcePath: databasePath,
      sourceSize: source.size,
      sourceMtimeMs: source.mtimeMs
    })
    return source.size
  }

  private async addManagedEntry(
    entries: ManagedBackupCatalogEntry[],
    input: {
      kind: Exclude<BackupEntryKind, 'database'>
      root: WorkRootRow
      sourcePath: string
      targetPath: string
      identity?: { key: string; value: string }
      expectedChecksum?: string
    }
  ): Promise<number> {
    const targetPath = this.normalizeManagedPath(input.targetPath)
    const sourcePath = await this.resolveManagedSource(
      input.root.path,
      input.sourcePath
    )
    if (input.identity) {
      await this.assertManifestIdentity(sourcePath, input.identity)
    }
    const source = await lstat(sourcePath)
    if (source.isSymbolicLink()) {
      throw new Error('Managed backup source cannot be a symbolic link')
    }
    if (!source.isFile()) {
      throw new Error('Managed backup source is not a file')
    }
    entries.push({
      kind: input.kind,
      archivePath: normalizeBackupRelativePath(
        `files/${this.securePaths.validateStableId(input.root.id)}/${targetPath}`
      ),
      sourcePath,
      sourceSize: source.size,
      sourceMtimeMs: source.mtimeMs,
      ...(input.expectedChecksum
        ? { expectedChecksum: input.expectedChecksum }
        : {}),
      workRootId: input.root.id,
      targetPath
    })
    return source.size
  }

  private async resolveManagedSource(
    rootPath: string,
    sourcePath: string
  ): Promise<string> {
    const sourceRelativePath = this.relativeTarget(rootPath, sourcePath)
    const candidatePath = resolve(
      await this.securePaths.canonicalizeDirectory(rootPath),
      ...sourceRelativePath.split('/')
    )
    const candidate = await lstat(candidatePath)
    if (candidate.isSymbolicLink()) {
      throw new Error('Managed backup source cannot be a symbolic link')
    }
    return (
      await this.securePaths.resolveExistingPath(
        rootPath,
        sourceRelativePath
      )
    ).targetPath
  }

  private relativeTarget(rootPath: string, targetPath: string | null): string {
    if (!targetPath) throw new Error('Managed backup path is unavailable')
    const relativePath = relative(rootPath, targetPath)
      .split(sep)
      .join('/')
    return this.normalizeManagedPath(relativePath)
  }

  private normalizeManagedPath(value: string): string {
    try {
      const normalized = this.securePaths.normalizeRelativePath(value)
      return normalizeBackupRelativePath(normalized)
    } catch {
      throw new Error('Managed backup path is invalid')
    }
  }

  private requirementSourceDirectory(
    requirement: RequirementRow
  ): string {
    if (requirement.requirement_trash_path) {
      return requirement.requirement_trash_path
    }
    if (requirement.space_trash_path) {
      if (!requirement.space_root_path || !requirement.workspace_root_path) {
        throw new Error('Managed backup path is unavailable')
      }
      const nestedPath = this.relativeTarget(
        requirement.space_root_path,
        requirement.workspace_root_path
      )
      return join(requirement.space_trash_path, ...nestedPath.split('/'))
    }
    if (!requirement.workspace_root_path) {
      throw new Error('Managed backup path is unavailable')
    }
    return requirement.workspace_root_path
  }

  private async assertManifestIdentity(
    sourcePath: string,
    identity: { key: string; value: string }
  ): Promise<void> {
    let manifest: Record<string, unknown>
    try {
      manifest = JSON.parse(
        await readFile(sourcePath, 'utf8')
      ) as Record<string, unknown>
    } catch {
      throw new Error('Managed backup manifest is invalid')
    }
    if (manifest.version !== 1 || manifest[identity.key] !== identity.value) {
      throw new Error('Managed backup manifest is invalid')
    }
  }

  private assertUniqueEntries(entries: ManagedBackupCatalogEntry[]): void {
    const archivePaths = new Set<string>()
    const targets = new Set<string>()
    for (const entry of entries) {
      if (archivePaths.has(entry.archivePath)) {
        throw new Error('Managed backup archive path is duplicated')
      }
      archivePaths.add(entry.archivePath)
      if (entry.workRootId && entry.targetPath) {
        const targetKey = `${entry.workRootId}:${entry.targetPath}`
        if (targets.has(targetKey)) {
          throw new Error('Managed backup target path is duplicated')
        }
        targets.add(targetKey)
      }
    }
  }
}

function requirementSelect(): string {
  return `SELECT
    requirement.id,
    requirement.workspace_id,
    requirement.workspace_root_path,
    workspace.work_root_id,
    root.path AS work_root_path,
    workspace.root_path AS space_root_path,
    space_deletion.trash_path AS space_trash_path,
    requirement_deletion.trash_path AS requirement_trash_path
   FROM requirements AS requirement
   JOIN workspaces AS workspace ON workspace.id = requirement.workspace_id
   LEFT JOIN work_roots AS root ON root.id = workspace.work_root_id
   LEFT JOIN entity_deletions AS space_deletion
     ON space_deletion.entity_type = 'workspace'
     AND space_deletion.entity_id = workspace.id
   LEFT JOIN entity_deletions AS requirement_deletion
     ON requirement_deletion.entity_type = 'requirement'
     AND requirement_deletion.entity_id = requirement.id`
}

function requireRoot(
  row: { work_root_id: string | null; work_root_path: string | null }
): WorkRootRow {
  if (!row.work_root_id || !row.work_root_path) {
    throw new Error('Managed backup work root is unavailable')
  }
  return { id: row.work_root_id, path: row.work_root_path }
}
