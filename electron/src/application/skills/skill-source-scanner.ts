import {
  lstat,
  readFile,
  readdir,
} from 'node:fs/promises'
import { join } from 'node:path'
import type {
  RegisteredSkillVersion,
  SkillSource,
} from '../../../../domain/skill-registry'
import { parseSkillPack } from './skill-pack-parser'

export type SkillSourceScanError = {
  relativePath: string
  code:
    | 'skill_pack_invalid'
    | 'skill_source_symlink_rejected'
    | 'skill_source_entry_invalid'
}

export type SkillSourceScanResult = {
  skills: RegisteredSkillVersion[]
  errors: SkillSourceScanError[]
}

type ScannerOptions = {
  maxBytes?: number
  maxPacks?: number
}

export class SkillSourceScanner {
  private readonly maxBytes: number
  private readonly maxPacks: number

  constructor(options: ScannerOptions = {}) {
    this.maxBytes = options.maxBytes ?? 1024 * 1024
    this.maxPacks = options.maxPacks ?? 256
  }

  async scan(input: {
    source: SkillSource
    rootPath: string
    at: number
  }): Promise<SkillSourceScanResult> {
    const root = await lstat(input.rootPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return undefined
      throw error
    })
    if (!root) return { skills: [], errors: [] }
    if (root.isSymbolicLink()) {
      return {
        skills: [],
        errors: [
          {
            relativePath: '.',
            code: 'skill_source_symlink_rejected',
          },
        ],
      }
    }
    if (!root.isDirectory()) {
      return {
        skills: [],
        errors: [{ relativePath: '.', code: 'skill_source_entry_invalid' }],
      }
    }

    const candidates: Array<{ path: string; relativePath: string }> = []
    const errors: SkillSourceScanError[] = []
    await this.addCandidate(
      join(input.rootPath, 'SKILL.md'),
      'SKILL.md',
      candidates,
      errors,
    )
    const entries = await readdir(input.rootPath, { withFileTypes: true })
    for (const entry of entries.sort((left, right) =>
      left.name.localeCompare(right.name),
    )) {
      if (entry.name === 'SKILL.md') continue
      if (entry.isSymbolicLink()) {
        errors.push({
          relativePath: entry.name,
          code: 'skill_source_symlink_rejected',
        })
        continue
      }
      if (!entry.isDirectory()) continue
      await this.addCandidate(
        join(input.rootPath, entry.name, 'SKILL.md'),
        `${entry.name}/SKILL.md`,
        candidates,
        errors,
      )
    }
    if (candidates.length > this.maxPacks) {
      throw new Error('Skill source pack limit exceeded')
    }

    const skills: RegisteredSkillVersion[] = []
    for (const candidate of candidates) {
      try {
        const content = await readFile(candidate.path, 'utf8')
        skills.push(
          parseSkillPack({
            source: input.source,
            content,
            discoveredAt: input.at,
            maxBytes: this.maxBytes,
          }),
        )
      } catch {
        errors.push({
          relativePath: candidate.relativePath,
          code: 'skill_pack_invalid',
        })
      }
    }
    return {
      skills: skills.sort(
        (left, right) =>
          left.skillId.localeCompare(right.skillId) ||
          left.version.localeCompare(right.version) ||
          left.digest.localeCompare(right.digest),
      ),
      errors: errors.sort((left, right) =>
        left.relativePath.localeCompare(right.relativePath),
      ),
    }
  }

  private async addCandidate(
    path: string,
    relativePath: string,
    candidates: Array<{ path: string; relativePath: string }>,
    errors: SkillSourceScanError[],
  ): Promise<void> {
    const metadata = await lstat(path).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return undefined
      throw error
    })
    if (!metadata) return
    if (metadata.isSymbolicLink()) {
      errors.push({
        relativePath,
        code: 'skill_source_symlink_rejected',
      })
      return
    }
    if (!metadata.isFile() || metadata.size > this.maxBytes) {
      errors.push({
        relativePath,
        code: 'skill_source_entry_invalid',
      })
      return
    }
    candidates.push({ path, relativePath })
  }
}
