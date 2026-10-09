import {
  compactAgentContext,
  validateAgentContextCompaction
} from './agent-context-compactor'

describe('Agent context compactor', () => {
  it('preserves objective, constraints, incomplete work, and source mappings', () => {
    const result = compactAgentContext({
      facts: [
        fact('objective', 'Ship Epic 13', ['message-user']),
        fact('constraints', 'Do not publish', ['message-user']),
        fact('constraints', 'Keep data local', ['policy-1']),
        fact('decisions', 'Use immutable checkpoints', ['event-12']),
        fact('incompleteItems', 'Run UI acceptance', ['todo-1']),
        fact('artifacts', 'Created checkpoint schema', ['artifact-1']),
        fact('references', 'Runtime PRD section 19', ['reference-1'])
      ],
      maxCharacters: 1_000
    })

    expect(result.summary).toEqual({
      objective: 'Ship Epic 13',
      constraints: ['Do not publish', 'Keep data local'],
      decisions: ['Use immutable checkpoints'],
      incompleteItems: ['Run UI acceptance'],
      artifacts: ['Created checkpoint schema'],
      references: ['Runtime PRD section 19']
    })
    expect(result.sourceMappings).toContainEqual({
      section: 'constraints',
      itemIndex: 1,
      sourceId: 'policy-1'
    })
    expect(result.characterCount).toBeLessThanOrEqual(1_000)
  })

  it('drops optional evidence before required facts when the budget is tight', () => {
    const result = compactAgentContext({
      facts: [
        fact('objective', 'Finish recovery', ['message-user']),
        fact('constraints', 'Never repeat writes', ['policy-1']),
        fact('incompleteItems', 'Reconcile connector result', ['event-9']),
        fact('decisions', 'x'.repeat(300), ['event-2']),
        fact('references', 'y'.repeat(300), ['reference-1'])
      ],
      maxCharacters: 120
    })

    expect(result.summary.objective).toBe('Finish recovery')
    expect(result.summary.constraints).toEqual(['Never repeat writes'])
    expect(result.summary.incompleteItems).toEqual([
      'Reconcile connector result'
    ])
    expect(result.summary.decisions).toEqual([])
    expect(result.summary.references).toEqual([])
  })

  it('rejects a budget that cannot retain every required fact', () => {
    expect(() =>
      compactAgentContext({
        facts: [
          fact('objective', 'Finish recovery', ['message-user']),
          fact('constraints', 'Never repeat writes', ['policy-1']),
          fact('incompleteItems', 'Reconcile result', ['event-9'])
        ],
        maxCharacters: 10
      })
    ).toThrow('Context budget cannot retain required facts')
  })

  it('rejects a candidate with an unknown source or missing objective', () => {
    const valid = compactAgentContext({
      facts: [
        fact('objective', 'Finish recovery', ['message-user']),
        fact('constraints', 'Keep data local', ['policy-1'])
      ],
      maxCharacters: 200
    })

    expect(() =>
      validateAgentContextCompaction({
        compaction: {
          ...valid,
          sourceMappings: [
            {
              section: 'objective',
              itemIndex: 0,
              sourceId: 'unknown'
            }
          ]
        },
        knownSourceIds: new Set(['message-user', 'policy-1']),
        requiredFacts: [
          fact('objective', 'Finish recovery', ['message-user']),
          fact('constraints', 'Keep data local', ['policy-1'])
        ],
        maxCharacters: 200
      })
    ).toThrow('Compaction references an unknown source')

    expect(() =>
      validateAgentContextCompaction({
        compaction: {
          ...valid,
          summary: { ...valid.summary, objective: '' }
        },
        knownSourceIds: new Set(['message-user', 'policy-1']),
        requiredFacts: [
          fact('objective', 'Finish recovery', ['message-user'])
        ],
        maxCharacters: 200
      })
    ).toThrow('Compaction omitted a required fact')
  })

  it('rejects a candidate over the fixed character budget', () => {
    const result = compactAgentContext({
      facts: [fact('objective', 'Finish recovery', ['message-user'])],
      maxCharacters: 200
    })

    expect(() =>
      validateAgentContextCompaction({
        compaction: { ...result, characterCount: 201 },
        knownSourceIds: new Set(['message-user']),
        requiredFacts: [
          fact('objective', 'Finish recovery', ['message-user'])
        ],
        maxCharacters: 200
      })
    ).toThrow('Compaction exceeds its context budget')
  })
})

function fact(
  section:
    | 'objective'
    | 'constraints'
    | 'decisions'
    | 'incompleteItems'
    | 'artifacts'
    | 'references',
  content: string,
  sourceIds: string[]
) {
  return { section, content, sourceIds }
}
