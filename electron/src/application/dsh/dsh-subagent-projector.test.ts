import { describe, expect, it } from 'vitest'
import {
  DSH_RUNTIME_EVENT_SCHEMA_VERSION,
  type DshRuntimeEventEnvelope
} from '../../../../shared/dsh-runtime-event-contract'
import { DshSubagentProjector } from './dsh-subagent-projector'

const owner = {
  workspaceId: 'workspace-1',
  requirementId: 'requirement-1',
  nodeRunId: 'node-run-1'
}

describe('DshSubagentProjector', () => {
  it('projects DSH Subagent lineage and status into Runtime delegation summaries without scheduling', () => {
    const projection = new DshSubagentProjector().project(
      runtimeEvent({
        sequence: 12,
        occurredAt: 2_000,
        data: {
          groupId: 'group-1',
          callId: 'delegate-1',
          parentRunId: 'run-1',
          rootRunId: 'root-run-1',
          children: [
            {
              taskId: 'task-2',
              childRunId: 'child-run-2',
              childSessionId: 'child-session-2',
              ordinal: 2,
              agentId: 'agent-review',
              agentName: 'Reviewer',
              objective: 'Inspect /Users/bytedance/private',
              status: 'running',
              startedAt: 1_950
            },
            {
              taskId: 'task-1',
              childRunId: 'child-run-1',
              childSessionId: 'child-session-1',
              ordinal: 1,
              objective: 'Summarize credential token=sk-live-secret usage',
              status: 'completed',
              resultSummary: 'No leaked token=sk-live-secret in /Users/private',
              evidence: [
                {
                  title: 'Trace',
                  summary: 'Checked authorization=Bearer abc'
                }
              ],
              unresolved: ['Confirm no remaining /tmp/private logs'],
              artifactIds: ['artifact-1'],
              completedAt: 2_000
            }
          ]
        }
      })
    )

    expect(projection).toMatchObject({
      groupId: 'group-1',
      callId: 'delegate-1',
      parentRunId: 'run-1',
      rootRunId: 'root-run-1',
      lineage: [
        {
          parentRunId: 'run-1',
          childRunId: 'child-run-1',
          childSessionId: 'child-session-1',
          ordinal: 1
        },
        {
          parentRunId: 'run-1',
          childRunId: 'child-run-2',
          childSessionId: 'child-session-2',
          ordinal: 2
        }
      ],
      delegations: [
        {
          runId: 'child-run-1',
          sessionId: 'child-session-1',
          parentRunId: 'run-1',
          status: 'completed',
          objective: 'Summarize credential token=[redacted] usage',
          result: {
            taskId: 'task-1',
            status: 'completed',
            summary: 'No leaked token=[redacted] in [local path]',
            evidence: [
              {
                title: 'Trace',
                summary: 'Checked authorization=[redacted] [redacted]'
              }
            ],
            unresolved: ['Confirm no remaining [local path] logs'],
            artifactIds: ['artifact-1']
          }
        },
        {
          runId: 'child-run-2',
          sessionId: 'child-session-2',
          parentRunId: 'run-1',
          status: 'running',
          objective: 'Inspect [local path]'
        }
      ],
      governanceFact: {
        kind: 'dsh.subagent',
        groupId: 'group-1',
        callId: 'delegate-1',
        childCount: 2,
        sequence: 12
      }
    })
    expect(JSON.stringify(projection)).not.toContain('sk-live-secret')
    expect(JSON.stringify(projection)).not.toContain('/Users/bytedance/private')
    expect(Object.isFrozen(projection)).toBe(true)
    expect(Object.isFrozen(projection.delegations[0]?.result)).toBe(true)
  })

  it('rejects non-subagent events and malformed child lineage', () => {
    const projector = new DshSubagentProjector()

    expect(() =>
      projector.project(runtimeEvent({ kind: 'goal.updated' }))
    ).toThrow(/subagent event/i)
    expect(() =>
      projector.project(
        runtimeEvent({
          data: {
            groupId: 'group-1',
            callId: 'delegate-1',
            parentRunId: 'run-1',
            children: [{ taskId: 'task-1', childRunId: '', childSessionId: 'child' }]
          }
        })
      )
    ).toThrow(/subagent child/i)
  })
})

function runtimeEvent(
  overrides: Partial<DshRuntimeEventEnvelope> = {}
): DshRuntimeEventEnvelope {
  return {
    schemaVersion: DSH_RUNTIME_EVENT_SCHEMA_VERSION,
    runtimeInstanceId: 'runtime-1',
    sessionId: 'session-1',
    runId: 'run-1',
    manifestDigest: 'a'.repeat(64),
    owner,
    eventId: 'event-1',
    sequence: 1,
    kind: 'subagent.lifecycle',
    occurredAt: 1_000,
    data: {
      groupId: 'group-1',
      callId: 'delegate-1',
      parentRunId: 'run-1',
      children: []
    },
    ...overrides
  }
}
