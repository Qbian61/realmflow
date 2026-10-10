import { join } from 'node:path'
import { vi } from 'vitest'
import { BuiltinCatalogLoader } from './builtin-catalog-loader'
import { SkillInstructionReader } from './skill-instruction-reader'

describe('SkillInstructionReader', () => {
  it('reads instructions only from the verified builtin package', async () => {
    const packages = await new BuiltinCatalogLoader(
      join(process.cwd(), 'resources', 'extensions', 'builtin')
    ).load()
    const definition = packages
      .flatMap(({ skills }) => skills)
      .find(({ id }) => id === 'builtin.skill.code_review')
    if (!definition) throw new Error('Builtin Skill fixture is missing')
    const local = { readSkillInstructions: vi.fn() }
    const reader = new SkillInstructionReader({ builtins: packages, local })

    await expect(reader.readInstructions(definition)).resolves.toContain(
      'Find defects'
    )
    expect(local.readSkillInstructions).not.toHaveBeenCalled()
  })

  it('reads the exact approved registry digest instead of mutable source files', async () => {
    const packages = await new BuiltinCatalogLoader(
      join(process.cwd(), 'resources', 'extensions', 'builtin')
    ).load()
    const original = packages
      .flatMap(({ skills }) => skills)
      .find(({ id }) => id === 'builtin.skill.code_review')
    if (!original) throw new Error('Builtin Skill fixture is missing')
    const definition = {
      ...original,
      origin: 'local_upload' as const,
      definitionDigest: '1'.repeat(64),
    }
    const local = {
      readSkillInstructions: vi.fn(async () => 'mutable source'),
    }
    const registry = {
      listAvailableDefinitions: vi.fn(() => [definition]),
      readInstructions: vi.fn(() => 'registered exact snapshot'),
    }
    const reader = new SkillInstructionReader({
      builtins: packages,
      local,
      registry,
    })

    await expect(reader.readInstructions(definition)).resolves.toBe(
      'registered exact snapshot'
    )
    expect(registry.readInstructions).toHaveBeenCalledWith(definition)
    expect(local.readSkillInstructions).not.toHaveBeenCalled()
  })
})
