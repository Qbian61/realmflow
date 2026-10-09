import type {
  ChatSessionRepository,
  ConversationTurnResult,
  NodeQuestionRecord,
  Revisioned,
  UnitOfWork
} from '../ports/business-repositories'
import type { ManageNodeQuestionsUseCase } from '../workflow/manage-node-questions'

type QuestionAnswer = {
  id: string
  nodeRunId: string
  answer: string
  expectedRevision: number
}

type Result = ConversationTurnResult & {
  answeredQuestion?: Revisioned<NodeQuestionRecord>
}

type Dependencies = {
  sessions: Pick<ChatSessionRepository, 'beginTurn'>
  questions: Pick<ManageNodeQuestionsUseCase, 'resolveWithinTransaction'>
  unitOfWork: UnitOfWork
}

class TurnRejected extends Error {
  constructor(readonly result: ConversationTurnResult) {
    super(result.status)
  }
}

export class BeginRequirementNodeTurnUseCase {
  constructor(private readonly dependencies: Dependencies) {}

  async execute(
    input: Parameters<ChatSessionRepository['beginTurn']>[0],
    question?: QuestionAnswer
  ): Promise<Result> {
    try {
      return await this.dependencies.unitOfWork.execute(async () => {
        const answeredQuestion = question
          ? await this.dependencies.questions.resolveWithinTransaction({
              id: question.id,
              nodeRunId: question.nodeRunId,
              status: 'answered',
              answer: question.answer,
              expectedRevision: question.expectedRevision
            })
          : undefined
        const turn = await this.dependencies.sessions.beginTurn(input)
        if (!['started', 'idempotent'].includes(turn.status)) {
          throw new TurnRejected(turn)
        }
        return {
          ...turn,
          ...(answeredQuestion ? { answeredQuestion } : {})
        }
      })
    } catch (error) {
      if (error instanceof TurnRejected) return error.result
      throw error
    }
  }
}
