import { createHash } from 'node:crypto'

export type RequirementMemoryAnswer = Readonly<{
  nodeId: string
  questionId: string
  prompt: string
  answer: string
  answeredAt: number
}>

export type RequirementMemoryArtifactReference = Readonly<{
  id: string
  stageId: string
  relativePath: string
  version: number
  checksum: string
}>

export type RequirementMemoryProjection = Readonly<{
  sourceId: string
  workspaceId: string
  sourceRevision: number
  sourceVersion: string
  checksum: string
  documentKey: 'requirement-memory.md'
  title: string
  content: string
}>

export function projectRequirementMemory(input: {
  requirement: Readonly<{
    id: string
    workspaceId: string
    title: string
    description: string
    scope: readonly string[]
    acceptanceCriteria: readonly string[]
  }>
  completionVersion: number
  confirmedAnswers: readonly RequirementMemoryAnswer[]
  formalArtifacts: readonly RequirementMemoryArtifactReference[]
}): RequirementMemoryProjection {
  const requirement = normalizeRequirement(input.requirement)
  if (
    !Number.isSafeInteger(input.completionVersion) ||
    input.completionVersion < 1
  ) {
    throw new Error('Requirement memory completion version is invalid')
  }
  const answers = input.confirmedAnswers.map(normalizeAnswer).sort(compareAnswer)
  const artifacts = input.formalArtifacts
    .map(normalizeArtifact)
    .sort(compareArtifact)
  const finalOutcomes = artifacts.filter(
    (artifact) => artifact.stageId !== 'retrospective'
  )
  const retrospectives = artifacts.filter(
    (artifact) => artifact.stageId === 'retrospective'
  )
  const content = [
    `# ${requirement.title}`,
    section('Description', requirement.description),
    listSection('Scope', requirement.scope),
    listSection('Acceptance criteria', requirement.acceptanceCriteria),
    answerSection(answers),
    artifactSection('Final outcome references', finalOutcomes, true),
    artifactSection('Retrospective references', retrospectives, false)
  ].join('\n\n') + '\n'

  return {
    sourceId: requirement.id,
    workspaceId: requirement.workspaceId,
    sourceRevision: input.completionVersion,
    sourceVersion: `requirement-memory:${input.completionVersion}`,
    checksum: sha256(content),
    documentKey: 'requirement-memory.md',
    title: requirement.title,
    content
  }
}

function normalizeRequirement(
  requirement: Readonly<{
    id: string
    workspaceId: string
    title: string
    description: string
    scope: readonly string[]
    acceptanceCriteria: readonly string[]
  }>
) {
  const id = requiredText(requirement.id, 'Requirement memory id is required')
  const workspaceId = requiredText(
    requirement.workspaceId,
    'Requirement memory workspace is required'
  )
  const title = requiredText(
    requirement.title,
    'Requirement memory title is required'
  )
  return {
    id,
    workspaceId,
    title,
    description: optionalText(requirement.description),
    scope: normalizeList(requirement.scope),
    acceptanceCriteria: normalizeList(requirement.acceptanceCriteria)
  }
}

function normalizeAnswer(
  answer: RequirementMemoryAnswer
): RequirementMemoryAnswer {
  const normalized = {
    nodeId: requiredText(
      answer.nodeId,
      'Requirement memory answer is invalid'
    ),
    questionId: requiredText(
      answer.questionId,
      'Requirement memory answer is invalid'
    ),
    prompt: requiredText(
      answer.prompt,
      'Requirement memory answer is invalid'
    ),
    answer: requiredText(
      answer.answer,
      'Requirement memory answer is invalid'
    ),
    answeredAt: answer.answeredAt
  }
  if (!Number.isSafeInteger(normalized.answeredAt) || normalized.answeredAt < 0) {
    throw new Error('Requirement memory answer is invalid')
  }
  return normalized
}

function normalizeArtifact(
  artifact: RequirementMemoryArtifactReference
): RequirementMemoryArtifactReference {
  if (
    !artifact.id.trim() ||
    !artifact.stageId.trim() ||
    !artifact.relativePath.trim() ||
    !Number.isSafeInteger(artifact.version) ||
    artifact.version < 1 ||
    !/^sha256:[a-f0-9]{64}$/.test(artifact.checksum)
  ) {
    throw new Error('Requirement memory artifact reference is invalid')
  }
  return {
    id: artifact.id.trim(),
    stageId: artifact.stageId.trim(),
    relativePath: artifact.relativePath.trim(),
    version: artifact.version,
    checksum: artifact.checksum
  }
}

function section(title: string, content: string): string {
  return `## ${title}\n\n${content || 'None'}`
}

function listSection(title: string, values: readonly string[]): string {
  return section(
    title,
    values.length > 0 ? values.map((value) => `- ${value}`).join('\n') : ''
  )
}

function answerSection(answers: readonly RequirementMemoryAnswer[]): string {
  return section(
    'Confirmed node answers',
    answers.length > 0
      ? answers
          .map(
            (answer) =>
              `- [${answer.nodeId}] ${answer.prompt}\n  ${answer.answer}`
          )
          .join('\n')
      : ''
  )
}

function artifactSection(
  title: string,
  artifacts: readonly RequirementMemoryArtifactReference[],
  includeStage: boolean
): string {
  return section(
    title,
    artifacts.length > 0
      ? artifacts
          .map(
            (artifact) =>
              `- ${includeStage ? `${artifact.stageId}: ` : ''}${artifact.relativePath} (artifact ${artifact.id}, version ${artifact.version}, ${artifact.checksum})`
          )
          .join('\n')
      : ''
  )
}

function compareAnswer(
  left: RequirementMemoryAnswer,
  right: RequirementMemoryAnswer
): number {
  return (
    left.answeredAt - right.answeredAt ||
    left.nodeId.localeCompare(right.nodeId) ||
    left.questionId.localeCompare(right.questionId)
  )
}

function compareArtifact(
  left: RequirementMemoryArtifactReference,
  right: RequirementMemoryArtifactReference
): number {
  return (
    left.stageId.localeCompare(right.stageId) ||
    left.relativePath.localeCompare(right.relativePath) ||
    left.id.localeCompare(right.id)
  )
}

function normalizeList(values: readonly string[]): string[] {
  return values.map(optionalText).filter(Boolean)
}

function optionalText(value: string): string {
  return value.trim().replace(/\r\n?/g, '\n')
}

function requiredText(value: string, message: string): string {
  const normalized = optionalText(value)
  if (!normalized) throw new Error(message)
  return normalized
}

function sha256(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}
