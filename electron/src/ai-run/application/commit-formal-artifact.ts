import { extname } from 'node:path'
import type { AiRunEvent, GeneratedArtifact } from '../../../../domain/ai-run'
import type { RequirementStageId } from '../../../../domain/requirement'
import type {
  ArtifactRepository,
  FormalArtifactCommitResult
} from './ports'

export type CommitFormalArtifactCommand = {
  runId: string
  requirementId: string
  stageId: RequirementStageId
  nodeId?: string
  nodeRunId?: string
  legacyStageId?: RequirementStageId
  expectedArtifact: {
    relativePath: string
    kind: string
  }
  artifact: GeneratedArtifact
  completionEvent: AiRunEvent
}

export class CommitFormalArtifactUseCase {
  constructor(
    private readonly artifacts: Pick<ArtifactRepository, 'commit'>
  ) {}

  async execute(
    command: CommitFormalArtifactCommand
  ): Promise<FormalArtifactCommitResult> {
    if (command.nodeId && !command.nodeRunId) {
      throw new Error('Node run is required for a node artifact')
    }
    if (
      command.completionEvent.runId !== command.runId ||
      command.completionEvent.type !== 'run.completed'
    ) {
      throw new Error('Artifact completion event is invalid')
    }
    if (!Number.isFinite(Date.parse(command.completionEvent.timestamp))) {
      throw new Error('Artifact completion timestamp is invalid')
    }
    if (command.artifact.path !== command.expectedArtifact.relativePath) {
      throw new Error('Candidate artifact path does not match node configuration')
    }
    if (artifactKind(command.artifact.path) !== command.expectedArtifact.kind) {
      throw new Error('Candidate artifact kind does not match node configuration')
    }
    return this.artifacts.commit(command)
  }
}

function artifactKind(path: string): string {
  const extension = extname(path).toLowerCase()
  if (['.md', '.markdown', '.mdx'].includes(extension)) return 'markdown'
  if (['.html', '.htm'].includes(extension)) return 'html'
  return 'file'
}
