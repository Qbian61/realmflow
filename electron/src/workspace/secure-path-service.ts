import { realpath, stat } from 'node:fs/promises'
import { dirname, isAbsolute, posix, relative, resolve, sep, win32 } from 'node:path'

export type SecurePathErrorCode =
  | 'INVALID_NAME'
  | 'INVALID_PATH'
  | 'PATH_OUTSIDE_ROOT'
  | 'ROOT_NOT_DIRECTORY'

export class SecurePathError extends Error {
  readonly name = 'SecurePathError'

  constructor(
    readonly code: SecurePathErrorCode,
    message: string
  ) {
    super(message)
  }
}

export type ResolvedSecurePath = {
  rootPath: string
  targetPath: string
  relativePath: string
}

const INVALID_SEGMENT_CHARACTERS = /[\u0000-\u001f\u007f<>:"|?*]/
const WINDOWS_RESERVED_NAME =
  /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/

export class SecurePathService {
  async canonicalizeDirectory(directoryPath: string): Promise<string> {
    const canonicalPath = await realpath(directoryPath)
    if (!(await stat(canonicalPath)).isDirectory()) {
      throw new SecurePathError(
        'ROOT_NOT_DIRECTORY',
        'Authorized root must be a directory'
      )
    }
    return canonicalPath
  }

  normalizeRelativePath(requestedPath: string, allowRoot = false): string {
    if (
      requestedPath.includes('\0') ||
      isAbsolute(requestedPath) ||
      win32.isAbsolute(requestedPath)
    ) {
      throw new SecurePathError(
        'INVALID_PATH',
        'Path is outside the bound workspace'
      )
    }

    const normalizedPath = requestedPath.replaceAll('\\', '/')
    if (allowRoot && normalizedPath === '.') return ''
    if (!normalizedPath) {
      if (allowRoot) return ''
      throw new SecurePathError(
        'INVALID_PATH',
        'Path is outside the bound workspace'
      )
    }

    const segments = normalizedPath.split('/')
    if (
      segments.some(
        (segment) =>
          !segment ||
          segment === '.' ||
          segment === '..' ||
          segment.endsWith(' ') ||
          segment.endsWith('.') ||
          INVALID_SEGMENT_CHARACTERS.test(segment) ||
          WINDOWS_RESERVED_NAME.test(segment)
      )
    ) {
      throw new SecurePathError(
        'INVALID_PATH',
        'Path is outside the bound workspace'
      )
    }
    return segments.join(posix.sep)
  }

  async resolveExistingPath(
    rootPath: string,
    requestedPath: string,
    allowRoot = false
  ): Promise<ResolvedSecurePath> {
    const relativePath = this.normalizeRelativePath(requestedPath, allowRoot)
    const canonicalRoot = await this.canonicalizeDirectory(rootPath)
    const candidatePath = resolve(canonicalRoot, relativePath || '.')
    this.assertInside(canonicalRoot, candidatePath)
    const targetPath = await realpath(candidatePath)
    this.assertInside(canonicalRoot, targetPath)
    return { rootPath: canonicalRoot, targetPath, relativePath }
  }

  async resolvePathForCreation(
    rootPath: string,
    requestedPath: string
  ): Promise<ResolvedSecurePath> {
    const relativePath = this.normalizeRelativePath(requestedPath)
    const canonicalRoot = await this.canonicalizeDirectory(rootPath)
    const candidatePath = resolve(canonicalRoot, relativePath)
    this.assertInside(canonicalRoot, candidatePath)

    let existingAncestor = dirname(candidatePath)
    let canonicalAncestor: string
    while (true) {
      try {
        canonicalAncestor = await realpath(existingAncestor)
        break
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        const parentPath = dirname(existingAncestor)
        if (parentPath === existingAncestor) throw error
        existingAncestor = parentPath
      }
    }
    this.assertInside(canonicalRoot, canonicalAncestor)
    const targetPath = resolve(
      canonicalAncestor,
      relative(existingAncestor, candidatePath)
    )
    this.assertInside(canonicalRoot, targetPath)
    return { rootPath: canonicalRoot, targetPath, relativePath }
  }

  assertInside(rootPath: string, targetPath: string): void {
    const relativePath = relative(rootPath, targetPath)
    if (
      relativePath === '..' ||
      relativePath.startsWith(`..${sep}`) ||
      isAbsolute(relativePath)
    ) {
      throw new SecurePathError(
        'PATH_OUTSIDE_ROOT',
        'Path is outside the bound workspace'
      )
    }
  }

  validateStableId(id: string): string {
    if (!STABLE_ID.test(id) || WINDOWS_RESERVED_NAME.test(id)) {
      throw new SecurePathError(
        'INVALID_NAME',
        'Managed directory id is invalid'
      )
    }
    return id
  }
}
