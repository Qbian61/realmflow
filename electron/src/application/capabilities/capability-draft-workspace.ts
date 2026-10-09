import { randomUUID } from 'node:crypto'
import {
  lstat,
  mkdir,
  rename,
  rm,
  writeFile
} from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'

type CapabilityDraftWorkspaceOptions = {
  userDataPath: string
  createId?: () => string
  write?: (path: string, content: string) => Promise<void>
}

export class CapabilityDraftWorkspace {
  private readonly rootPath: string
  private readonly stagingPath: string
  private readonly createId: () => string
  private readonly write: (path: string, content: string) => Promise<void>

  constructor(options: CapabilityDraftWorkspaceOptions) {
    this.rootPath = resolve(
      options.userDataPath,
      'capabilities',
      'drafts'
    )
    this.stagingPath = resolve(
      options.userDataPath,
      'capabilities',
      '.draft-staging'
    )
    this.createId = options.createId ?? randomUUID
    this.write = options.write ?? ((path, content) => writeFile(path, content))
  }

  async publish(input: {
    sessionId: string
    revision: number
    files: Readonly<Record<string, string>>
  }): Promise<string> {
    assertIdentifier(input.sessionId)
    if (!Number.isSafeInteger(input.revision) || input.revision < 1) {
      throw new Error('Capability draft revision is invalid')
    }
    const entries = Object.entries(input.files)
    if (entries.length === 0) {
      throw new Error('Capability draft files are required')
    }
    for (const [relativePath] of entries) {
      assertRelativePath(relativePath)
    }
    const finalPath = resolve(
      this.rootPath,
      input.sessionId,
      String(input.revision)
    )
    assertContained(this.rootPath, finalPath)
    if (await pathExists(finalPath)) {
      throw new Error('Capability draft revision already exists')
    }
    const temporaryPath = resolve(
      this.stagingPath,
      `${input.sessionId}.${input.revision}.${this.createId()}`
    )
    assertContained(this.stagingPath, temporaryPath)
    await mkdir(temporaryPath, { recursive: true })
    try {
      for (const [relativePath, content] of entries.sort(
        ([left], [right]) => left.localeCompare(right)
      )) {
        const targetPath = resolve(
          temporaryPath,
          ...relativePath.split('/')
        )
        assertContained(temporaryPath, targetPath)
        await mkdir(dirname(targetPath), { recursive: true })
        await this.write(targetPath, content)
      }
      await mkdir(dirname(finalPath), { recursive: true })
      if (await pathExists(finalPath)) {
        throw new Error('Capability draft revision already exists')
      }
      await rename(temporaryPath, finalPath)
      return finalPath
    } catch (error) {
      await rm(temporaryPath, { recursive: true, force: true })
      throw error
    }
  }

  async remove(sessionId: string): Promise<void> {
    assertIdentifier(sessionId)
    const targetPath = resolve(this.rootPath, sessionId)
    assertContained(this.rootPath, targetPath)
    await rm(targetPath, { recursive: true, force: true })
  }

  resolve(sessionId: string, revision: number): string {
    assertIdentifier(sessionId)
    if (!Number.isSafeInteger(revision) || revision < 1) {
      throw new Error('Capability draft revision is invalid')
    }
    const targetPath = resolve(
      this.rootPath,
      sessionId,
      String(revision)
    )
    assertContained(this.rootPath, targetPath)
    return targetPath
  }
}

function assertIdentifier(value: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value)) {
    throw new Error('Capability draft session ID is invalid')
  }
}

function assertRelativePath(value: string): void {
  const normalized = value.replaceAll('\\', '/')
  if (
    !normalized ||
    normalized.startsWith('/') ||
    normalized.split('/').some((part) => !part || part === '..') ||
    normalized.includes('\0')
  ) {
    throw new Error('Capability draft file path is invalid')
  }
}

function assertContained(rootPath: string, candidatePath: string): void {
  if (
    candidatePath !== rootPath &&
    !candidatePath.startsWith(`${rootPath}${sep}`)
  ) {
    throw new Error('Capability draft path escapes managed storage')
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}
