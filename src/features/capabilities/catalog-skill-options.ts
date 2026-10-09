import type { SkillCatalogDto } from '../../../shared/business'
import type { ToolCatalogSkillDto } from '../../../shared/tool-catalog'

export function toSkillCatalogOptions(
  skills: ToolCatalogSkillDto[]
): SkillCatalogDto[] {
  const byId = new Map<string, ToolCatalogSkillDto[]>()
  for (const skill of skills) {
    const versions = byId.get(skill.id) ?? []
    versions.push(skill)
    byId.set(skill.id, versions)
  }
  return [...byId.entries()]
    .map(([id, versions]) => {
      const sorted = versions.sort((left, right) =>
        compareVersions(left.version, right.version)
      )
      const current = sorted.at(-1)!
      return {
        skill: {
          id,
          enabled: current.status === 'enabled',
          currentVersionId: optionId(current),
          revision: current.revision,
          createdAt: Math.min(...sorted.map(({ updatedAt }) => updatedAt)),
          updatedAt: current.updatedAt
        },
        versions: sorted.map((item) => ({
          id: optionId(item),
          skillId: item.id,
          version: item.version,
          name: item.definition.name,
          description: item.definition.description,
          entry: {
            kind: 'prompt' as const,
            path: item.definition.instructionsPath
          },
          inputSchema: structuredClone(item.definition.inputSchema),
          outputSchema: structuredClone(item.definition.outputSchema),
          permissions: [],
          network: { required: false, services: [] },
          resources: {
            timeoutMs: item.definition.limits.timeoutMs,
            maxMemoryMb: 0,
            maxOutputBytes: 4 * 1024 * 1024
          },
          source: {
            type: 'local_directory' as const,
            displayName: item.definition.origin
          },
          checksum: item.definitionDigest,
          byteSize: 0,
          fileCount: 1,
          installedAt: item.updatedAt,
          integrity: {
            status:
              item.status === 'corrupted' ? 'corrupted' as const : 'verified' as const,
            checkedAt: item.updatedAt,
            message:
              item.status === 'corrupted'
                ? 'Skill definition is corrupted'
                : 'Skill definition verified'
          }
        }))
      }
    })
    .sort((left, right) => left.skill.id.localeCompare(right.skill.id))
}

function optionId(skill: ToolCatalogSkillDto): string {
  return `${skill.id}@${skill.version}`
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.split('.').map(Number)
  const rightParts = right.split('.').map(Number)
  for (let index = 0; index < 3; index += 1) {
    const difference = leftParts[index] - rightParts[index]
    if (difference !== 0) return difference
  }
  return 0
}
