import {
  lstat,
  realpath
} from 'node:fs/promises'
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve
} from 'node:path'

export type ScopePathResolution = {
  canonicalPath: string
  canonicalRoot?: string
}

export class ScopePathResolver {
  async plan(input: {
    path: string
    roots: readonly string[]
    operation: 'read' | 'write'
  }): Promise<ScopePathResolution> {
    assertPathText(input.path, true)
    if (!isAbsolute(input.path) && input.roots.length !== 1) {
      throw new Error('A relative Tool path requires exactly one scope root')
    }

    const canonicalRoots = await Promise.all(
      input.roots.map((root) => canonicalizeRoot(root))
    )
    const candidate = isAbsolute(input.path)
      ? resolve(input.path)
      : resolve(canonicalRoots[0], input.path)
    const canonicalPath =
      input.operation === 'read'
        ? await realpath(candidate)
        : await canonicalizeWritablePath(candidate)
    const canonicalRoot = canonicalRoots.find((root) =>
      isWithin(root, canonicalPath)
    )
    return { canonicalPath, canonicalRoot }
  }

  async resolve(input: {
    path: string
    roots: readonly string[]
    operation: 'read' | 'write'
  }): Promise<ScopePathResolution & { canonicalRoot: string }> {
    const planned = await this.plan(input)
    const canonicalRoot = planned.canonicalRoot
    if (!canonicalRoot) {
      throw new Error('Tool path is outside the authorized scope')
    }
    return { canonicalPath: planned.canonicalPath, canonicalRoot }
  }
}

async function canonicalizeRoot(root: string): Promise<string> {
  assertPathText(root)
  if (!isAbsolute(root)) {
    throw new Error('Tool scope root must be absolute')
  }
  try {
    return await realpath(root)
  } catch {
    throw new Error('Tool scope root is unavailable')
  }
}

async function canonicalizeWritablePath(path: string): Promise<string> {
  try {
    return await realpath(path)
  } catch {
    const remainder: string[] = []
    let ancestor = path
    while (!(await pathExists(ancestor))) {
      const parent = dirname(ancestor)
      if (parent === ancestor) {
        throw new Error('Tool path has no accessible parent')
      }
      const segment = basename(ancestor)
      if (!segment || segment === '.' || segment === '..') {
        throw new Error('Tool path contains an invalid segment')
      }
      remainder.unshift(segment)
      ancestor = parent
    }
    const canonicalAncestor = await realpath(ancestor)
    return join(canonicalAncestor, ...remainder)
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return false
    }
    throw error
  }
}

function isWithin(root: string, target: string): boolean {
  const child = relative(root, target)
  return child === '' || (!child.startsWith('..') && !isAbsolute(child))
}

function assertPathText(path: string, allowEmpty = false): void {
  if ((!allowEmpty && !path) || path.includes('\0')) {
    throw new Error('Tool path is invalid')
  }
}
