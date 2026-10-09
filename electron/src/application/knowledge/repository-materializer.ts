import { execFile } from 'node:child_process'
import { mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, posix } from 'node:path'
import { promisify } from 'node:util'
import type {
  RemoteRepositoryManifest,
  RemoteRepositorySource
} from '../../../../domain/repository-source'
import { SecurePathService } from '../../workspace/secure-path-service'

const executeFile = promisify(execFile)

export type CommittedRepositoryMaterialization = {
  managedPath: string
  finalize(): Promise<void>
  rollback(): Promise<void>
}

export type PreparedRepositoryMaterialization = {
  stagingPath: string
  managedPath: string
  commit(): Promise<CommittedRepositoryMaterialization>
  discard(): Promise<void>
}

export class RepositoryMaterializer {
  constructor(
    private readonly securePaths = new SecurePathService()
  ) {}

  async prepare(input: {
    workspacePath: string
    repository: RemoteRepositorySource
    manifest: RemoteRepositoryManifest
  }): Promise<PreparedRepositoryMaterialization> {
    const workspacePath = await this.securePaths.canonicalizeDirectory(
      input.workspacePath
    )
    const transactionRelativePath = posix.join(
      '.realmflow',
      'tmp',
      'repository-ingestion',
      input.repository.sourceId
    )
    const transactionPath = (
      await this.securePaths.resolvePathForCreation(
        workspacePath,
        transactionRelativePath
      )
    ).targetPath
    const stagingPath = (
      await this.securePaths.resolvePathForCreation(
        workspacePath,
        posix.join(transactionRelativePath, 'staging')
      )
    ).targetPath
    const backupPath = (
      await this.securePaths.resolvePathForCreation(
        workspacePath,
        posix.join(transactionRelativePath, 'backup')
      )
    ).targetPath
    const managedPath = (
      await this.securePaths.resolvePathForCreation(
        workspacePath,
        input.repository.managedRelativePath
      )
    ).targetPath

    await rm(transactionPath, { recursive: true, force: true })
    await mkdir(stagingPath, { recursive: true })
    try {
      for (const file of input.manifest.files) {
        const targetPath = (
          await this.securePaths.resolvePathForCreation(stagingPath, file.path)
        ).targetPath
        await mkdir(dirname(targetPath), { recursive: true })
        await writeFile(targetPath, file.content, {
          encoding: 'utf8',
          mode: 0o600
        })
      }
      await executeFile('git', ['init', '--quiet', stagingPath], {
        maxBuffer: 64 * 1024
      })
    } catch (error) {
      await rm(transactionPath, { recursive: true, force: true })
      throw error
    }

    return {
      stagingPath,
      managedPath,
      discard: () => rm(transactionPath, { recursive: true, force: true }),
      commit: async () => {
        await rm(posix.join(stagingPath, '.git'), {
          recursive: true,
          force: true
        })
        await mkdir(dirname(managedPath), { recursive: true })
        const hadPrevious = await pathExists(managedPath)
        try {
          if (hadPrevious) await rename(managedPath, backupPath)
          await rename(stagingPath, managedPath)
        } catch (error) {
          if (hadPrevious && (await pathExists(backupPath))) {
            await rename(backupPath, managedPath)
          }
          throw error
        }

        let settled = false
        return {
          managedPath,
          finalize: async () => {
            if (settled) return
            await rm(transactionPath, { recursive: true, force: true })
            settled = true
          },
          rollback: async () => {
            if (settled) return
            await rm(managedPath, { recursive: true, force: true })
            if (hadPrevious && (await pathExists(backupPath))) {
              await rename(backupPath, managedPath)
            }
            await rm(transactionPath, { recursive: true, force: true })
            settled = true
          }
        }
      }
    }
  }

  async recoverWorkspace(input: {
    workspacePath: string
    repositories: RemoteRepositorySource[]
  }): Promise<boolean> {
    const workspacePath = await this.securePaths.canonicalizeDirectory(
      input.workspacePath
    )
    const temporaryRoot = (
      await this.securePaths.resolvePathForCreation(
        workspacePath,
        '.realmflow/tmp/repository-ingestion'
      )
    ).targetPath
    let entries
    try {
      entries = await readdir(temporaryRoot, { withFileTypes: true })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
      throw error
    }
    const repositories = new Map(
      input.repositories.map((repository) => [
        repository.sourceId,
        repository
      ])
    )
    for (const entry of entries) {
      const transactionPath = (
        await this.securePaths.resolveExistingPath(temporaryRoot, entry.name)
      ).targetPath
      const repository = repositories.get(entry.name)
      if (!entry.isDirectory() || !repository) {
        await rm(transactionPath, { recursive: true, force: true })
        continue
      }
      const managedPath = (
        await this.securePaths.resolvePathForCreation(
          workspacePath,
          repository.managedRelativePath
        )
      ).targetPath
      const backupPath = posix.join(transactionPath, 'backup')
      const stagingPath = posix.join(transactionPath, 'staging')
      if (await pathExists(backupPath)) {
        await rm(managedPath, { recursive: true, force: true })
        await rename(backupPath, managedPath)
      } else if (
        !(await pathExists(stagingPath)) &&
        repository.currentVersion === 0
      ) {
        await rm(managedPath, { recursive: true, force: true })
      }
      await rm(transactionPath, { recursive: true, force: true })
    }
    await rm(temporaryRoot, { recursive: true, force: true })
    return true
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}
