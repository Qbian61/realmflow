import { lstat, readFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import type { SkillDefinition } from '../../../../domain/skill-definition'
import type { BuiltinCatalogPackage } from './builtin-catalog-loader'
import type { ExtensionPackageService } from './extension-package-service'

type Dependencies = {
  builtins: readonly BuiltinCatalogPackage[]
  local: Pick<ExtensionPackageService, 'readSkillInstructions'>
  registry?: {
    listAvailableDefinitions(): SkillDefinition[]
    readInstructions(
      definition: Pick<
        SkillDefinition,
        'id' | 'version' | 'definitionDigest'
      >,
    ): string
  }
  maxBytes?: number
}

export class SkillInstructionReader {
  private readonly maxBytes: number

  constructor(private readonly dependencies: Dependencies) {
    this.maxBytes = dependencies.maxBytes ?? 1024 * 1024
  }

  async readInstructions(definition: SkillDefinition): Promise<string> {
    if (
      this.dependencies.registry
        ?.listAvailableDefinitions()
        .some(
          ({ id, version, definitionDigest }) =>
            id === definition.id &&
            version === definition.version &&
            definitionDigest === definition.definitionDigest,
        )
    ) {
      return this.dependencies.registry.readInstructions(definition)
    }
    if (definition.origin === 'local_upload') {
      return this.dependencies.local.readSkillInstructions(definition)
    }
    if (definition.origin !== 'builtin') {
      throw new Error('Skill instructions are unavailable')
    }
    const packageItem = this.dependencies.builtins.find(
      ({ packageDigest, skills }) =>
        packageDigest === definition.package.packageDigest &&
        skills.some(
          ({ id, version, definitionDigest }) =>
            id === definition.id &&
            version === definition.version &&
            definitionDigest === definition.definitionDigest
        )
    )
    if (!packageItem) {
      throw new Error('Builtin Skill package is unavailable')
    }
    const path = resolve(
      packageItem.rootPath,
      ...definition.instructionsPath.split('/')
    )
    if (
      path === packageItem.rootPath ||
      !path.startsWith(`${packageItem.rootPath}${sep}`)
    ) {
      throw new Error('Builtin Skill instructions path is invalid')
    }
    const metadata = await lstat(path)
    if (
      !metadata.isFile() ||
      metadata.isSymbolicLink() ||
      metadata.size > this.maxBytes
    ) {
      throw new Error('Builtin Skill instructions file is invalid')
    }
    return readFile(path, 'utf8')
  }
}
