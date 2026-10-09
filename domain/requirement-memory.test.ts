import { describe, expect, it } from 'vitest'
import { projectRequirementMemory } from './requirement-memory'

const baseInput = {
  requirement: {
    id: 'requirement-1',
    workspaceId: 'workspace-1',
    title: 'Ship local knowledge',
    description: 'Keep retrieval local and deterministic.',
    scope: ['Workspace search', 'Node context'],
    acceptanceCriteria: ['No cloud index', 'Stable retrieval']
  },
  completionVersion: 2,
  confirmedAnswers: [
    {
      nodeId: 'node-2',
      questionId: 'question-2',
      prompt: 'Which model?',
      answer: 'Pinned local GTE',
      answeredAt: 20
    },
    {
      nodeId: 'node-1',
      questionId: 'question-1',
      prompt: 'Where is data stored?',
      answer: 'SQLite and local Qdrant',
      answeredAt: 10
    }
  ],
  formalArtifacts: [
    {
      id: 'artifact-2',
      stageId: 'retrospective',
      relativePath: 'artifacts/retrospective.md',
      version: 1,
      checksum: `sha256:${'b'.repeat(64)}`
    },
    {
      id: 'artifact-1',
      stageId: 'release',
      relativePath: 'artifacts/release.md',
      version: 3,
      checksum: `sha256:${'a'.repeat(64)}`
    }
  ]
} as const

describe('requirement memory projection', () => {
  it('projects deterministic sections, confirmed answers, and formal references', () => {
    const projected = projectRequirementMemory(baseInput)

    expect(projected).toMatchObject({
      sourceId: 'requirement-1',
      workspaceId: 'workspace-1',
      sourceRevision: 2,
      sourceVersion: 'requirement-memory:2',
      documentKey: 'requirement-memory.md',
      title: 'Ship local knowledge'
    })
    expect(projected.content).toBe(`# Ship local knowledge

## Description

Keep retrieval local and deterministic.

## Scope

- Workspace search
- Node context

## Acceptance criteria

- No cloud index
- Stable retrieval

## Confirmed node answers

- [node-1] Where is data stored?
  SQLite and local Qdrant
- [node-2] Which model?
  Pinned local GTE

## Final outcome references

- release: artifacts/release.md (artifact artifact-1, version 3, sha256:${'a'.repeat(64)})

## Retrospective references

- artifacts/retrospective.md (artifact artifact-2, version 1, sha256:${'b'.repeat(64)})
`)
    expect(projected.checksum).toMatch(/^sha256:[a-f0-9]{64}$/)
  })

  it('is stable across input ordering and changes version on recompletion', () => {
    const first = projectRequirementMemory(baseInput)
    const reordered = projectRequirementMemory({
      ...baseInput,
      confirmedAnswers: [...baseInput.confirmedAnswers].reverse(),
      formalArtifacts: [...baseInput.formalArtifacts].reverse()
    })
    const recompleted = projectRequirementMemory({
      ...baseInput,
      completionVersion: 3
    })

    expect(reordered.content).toBe(first.content)
    expect(reordered.checksum).toBe(first.checksum)
    expect(recompleted.content).toBe(first.content)
    expect(recompleted.sourceVersion).toBe('requirement-memory:3')
  })

  it('never copies artifact content into the requirement memory document', () => {
    const input = {
      ...baseInput,
      formalArtifacts: [
        {
          ...baseInput.formalArtifacts[0],
          content: 'SECRET ARTIFACT BODY MUST NOT BE COPIED'
        }
      ]
    }

    const projected = projectRequirementMemory(input)

    expect(projected.content).not.toContain('SECRET ARTIFACT BODY')
    expect(projected.content).toContain('artifacts/retrospective.md')
  })

  it('rejects invalid completion versions and non-formal checksums', () => {
    expect(() =>
      projectRequirementMemory({ ...baseInput, completionVersion: 0 })
    ).toThrow('Requirement memory completion version is invalid')
    expect(() =>
      projectRequirementMemory({
        ...baseInput,
        formalArtifacts: [
          { ...baseInput.formalArtifacts[0], checksum: 'not-a-checksum' }
        ]
      })
    ).toThrow('Requirement memory artifact reference is invalid')
  })
})
