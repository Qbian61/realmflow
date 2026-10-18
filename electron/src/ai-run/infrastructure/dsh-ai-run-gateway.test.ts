import { describe, expect, it, vi } from 'vitest'
import {
  createDshSessionBinding,
  dshRunOwnerKey,
  type DshSessionBinding
} from '../../../../domain/dsh-session-binding'
import {
  sealDshRunManifest,
  type DshRunManifest,
  type DshRunOwner
} from '../../../../domain/dsh-run-manifest'
import type { AiRunEvent } from '../../../../domain/ai-run'
import type { ModelExecutionConfig } from '../../../../domain/model'
import type { DshRuntimeEventEnvelope } from '../../../../shared/dsh-runtime-event-contract'
import type {
  DshRuntimeEventIngestionResult
} from '../../application/dsh/dsh-runtime-event-ingestor'
import type { DshRuntimeEventProjectionResult } from '../../application/dsh/dsh-runtime-event-projector'
import type { DshRunManifestPublisherInput } from '../../application/dsh/dsh-run-manifest-publisher'
import type {
  DshAcpSessionUpdate,
  RunContext,
  RunToolConfiguration
} from '../application/ports'
import {
  DshAiRunGateway,
  type DshAgentRunAdmission
} from './dsh-ai-run-gateway'

describe('DshAiRunGateway', () => {
  it('publishes the immutable run manifest and accepts bridges before the first ACP prompt', async () => {
    const harness = createHarness()

    const created = await harness.gateway.createRun(
      conversationContext(),
      modelConfig(),
      toolConfiguration()
    )

    expect(created).toEqual({ runId: 'realmflow-run-1' })
    expect(harness.log).toEqual([
      'compile:realmflow-run-1',
      'runtime.start',
      'session.new:/workspace/one',
      'manifest.publish:realmflow-run-1:dsh-session-1',
      'session.save:dsh-session-1',
      'accept:credential:dsh-session-1',
      'accept:product:dsh-session-1',
      'accept:events:dsh-session-1',
      'config:reasoning_effort=high',
      'runtime-run.create:realmflow-run-1',
      'prompt:dsh-session-1'
    ])
    expect(harness.publisher.inputs[0]).toMatchObject({
      runId: 'realmflow-run-1',
      sessionId: 'dsh-session-1',
      owner: {
        workspaceId: 'workspace-1'
      },
      model: {
        reasoningEffort: 'high',
        profileId: 'profile-gpt'
      }
    })
    expect(harness.runtime.prompts).toEqual([
      {
        sessionId: 'dsh-session-1',
        prompt: [{ type: 'text', text: 'Ship this feature' }]
      }
    ])
    expect(JSON.stringify(harness.runtime.prompts[0])).not.toContain(
      'toolEndpoint'
    )
    expect(JSON.stringify(harness.runtime.prompts[0])).not.toContain(
      'realmflow.run_manifest'
    )
  })

  it('persists DSH lifecycle before prompting and terminalizes before yielding completion', async () => {
    const harness = createHarness()
    const context = conversationContext()

    const created = await harness.gateway.createRun(context)
    const signal = new AbortController()
    const streamed = collectEvents(
      harness.gateway.streamEvents(created.runId, signal.signal)
    )
    harness.runtime.resolvePrompt('dsh-session-1', { stopReason: 'end_turn' })

    await expect(streamed).resolves.toEqual([
      expect.objectContaining({ type: 'run.completed' })
    ])
    expect(harness.runtimeRuns.create).toHaveBeenCalledWith({
      runId: created.runId,
      context,
      manifest: harness.publisher.publications[0].manifest,
      createdAt: 1_700
    })
    expect(harness.runtimeRuns.transition).toHaveBeenCalledWith({
      runId: created.runId,
      status: 'completed',
      updatedAt: 1_700
    })
    expect(harness.log.indexOf('runtime-run.create:realmflow-run-1'))
      .toBeLessThan(harness.log.indexOf('prompt:dsh-session-1'))
  })

  it('resumes the owner-bound DSH session and cancels through session/cancel without exposing the DSH session id', async () => {
    const existing = createDshSessionBinding({
      owner: { workspaceId: 'workspace-1' },
      dshSessionId: 'dsh-session-existing',
      runManifestDigest: 'a'.repeat(64),
      runtimeBuildDigest: runtimeBuildDigest,
      createdAt: 1
    })
    const harness = createHarness({ existingBinding: existing })

    const created = await harness.gateway.createRun(conversationContext())
    await harness.gateway.cancelRun(created.runId)

    expect(created.runId).toBe('realmflow-run-1')
    expect(created.runId).not.toBe('dsh-session-existing')
    expect(harness.runtime.newSessions).toHaveLength(0)
    expect(harness.runtime.resumedSessions).toEqual([
      {
        sessionId: 'dsh-session-existing',
        cwd: '/workspace/one',
        mcpServers: [{ name: 'realmflow-docs', url: 'http://127.0.0.1:7777/mcp' }]
      }
    ])
    expect(harness.sessions.saved.at(-1)).toMatchObject({
      dshSessionId: 'dsh-session-existing',
      runManifestDigest: harness.publisher.publications[0].manifest.digest
    })
    expect(harness.runtime.cancelledSessionIds).toEqual([
      'dsh-session-existing'
    ])
  })

  it('opens ACP sessions with an explicit empty MCP server list when the compiler has none', async () => {
    const { mcpServers: _omitted, ...admissionWithoutMcpServers } = admission()
    const harness = createHarness({ admission: admissionWithoutMcpServers })

    await harness.gateway.createRun(conversationContext())

    expect(harness.runtime.newSessions).toEqual([
      {
        cwd: '/workspace/one',
        mcpServers: []
      }
    ])
  })

  it('syncs supported DSH model credentials before starting the runtime', async () => {
    const harness = createHarness()

    await harness.gateway.createRun(conversationContext(), {
      ...modelConfig(),
      providerId: 'builtin-deepseek',
      catalogProviderId: 'deepseek',
      modelProfileId: 'builtin-deepseek:deepseek-flash',
      modelId: 'deepseek-flash',
      apiKey: 'sk-deepseek'
    })

    expect(harness.log.slice(0, 3)).toEqual([
      'compile:realmflow-run-1',
      'credential.sync:builtin-deepseek',
      'runtime.start'
    ])
    expect(harness.runtime.syncedModelCredentialProviderIds).toEqual([
      'builtin-deepseek'
    ])
  })

  it('reuses an owner-bound DSH session already admitted in this process without resuming it again', async () => {
    const harness = createHarness()

    const first = await harness.gateway.createRun(conversationContext())
    harness.runtime.resolvePrompt('dsh-session-1', { stopReason: 'end_turn' })
    await flush()
    harness.gateway.releaseRun(first.runId)

    const second = await harness.gateway.createRun(conversationContext())

    expect(second).toEqual({ runId: 'realmflow-run-1' })
    expect(harness.runtime.newSessions).toHaveLength(1)
    expect(harness.runtime.resumedSessions).toEqual([])
    expect(harness.runtime.prompts).toEqual([
      {
        sessionId: 'dsh-session-1',
        prompt: [{ type: 'text', text: 'Ship this feature' }]
      },
      {
        sessionId: 'dsh-session-1',
        prompt: [{ type: 'text', text: 'Ship this feature' }]
      }
    ])
  })

  it('rejects new work for the same owner while its DSH session is closing but allows independent sessions', async () => {
    const closing = createDshSessionBinding({
      owner: { workspaceId: 'workspace-1' },
      dshSessionId: 'dsh-session-closing',
      runManifestDigest: 'a'.repeat(64),
      runtimeBuildDigest,
      lifecycleStatus: 'closing',
      createdAt: 1
    })
    const harness = createHarness({ existingBinding: closing })

    await expect(
      harness.gateway.createRun(conversationContext())
    ).rejects.toThrow('DSH session is closing')
    expect(harness.runtime.resumedSessions).toEqual([])
    expect(harness.runtime.prompts).toEqual([])

    await expect(
      harness.gateway.createRun({
        ...conversationContext(),
        workspaceId: 'workspace-2'
      })
    ).resolves.toEqual({ runId: 'realmflow-run-1' })
    expect(harness.runtime.newSessions).toHaveLength(1)
  })

  it('streams projected DSH runtime events and normalizes prompt settlement into existing AiRun events', async () => {
    const harness = createHarness()
    const created = await harness.gateway.createRun(conversationContext())
    const manifest = harness.publisher.publications[0].manifest
    const signal = new AbortController()
    const streamed = collectEvents(
      harness.gateway.streamEvents(created.runId, signal.signal)
    )

    harness.runtime.sendUpdate(manifest.sessionId, {
      sessionUpdate: 'dsh_runtime_event',
      event: runtimeEvent({
        runId: created.runId,
        sessionId: manifest.sessionId,
        manifestDigest: manifest.digest,
        owner: manifest.owner,
        kind: 'model.text_delta',
        data: { delta: 'Hello from DSH' }
      })
    })
    await flush()
    harness.runtime.resolvePrompt(manifest.sessionId, { stopReason: 'end_turn' })

    await expect(streamed).resolves.toEqual([
      expect.objectContaining({
        runId: created.runId,
        type: 'answer.delta',
        data: { delta: 'Hello from DSH' }
      }),
      expect.objectContaining({
        runId: created.runId,
        type: 'run.completed'
      })
    ])
    expect(harness.ingestor.ingested).toHaveLength(1)
  })

  it('streams standard ACP assistant message chunks as answer deltas', async () => {
    const harness = createHarness()
    const created = await harness.gateway.createRun(conversationContext())
    const manifest = harness.publisher.publications[0].manifest
    const signal = new AbortController()
    const streamed = collectEvents(
      harness.gateway.streamEvents(created.runId, signal.signal)
    )

    harness.runtime.sendUpdate(manifest.sessionId, {
      sessionUpdate: 'agent_message_chunk',
      content: {
        type: 'text',
        text: 'OK'
      }
    })
    await flush()
    harness.runtime.resolvePrompt(manifest.sessionId, { stopReason: 'end_turn' })

    await expect(streamed).resolves.toEqual([
      expect.objectContaining({
        runId: created.runId,
        type: 'answer.delta',
        data: { delta: 'OK' }
      }),
      expect.objectContaining({
        runId: created.runId,
        type: 'run.completed'
      })
    ])
    expect(harness.ingestor.ingested).toHaveLength(0)
  })

  it('projects ACP tool calls and approval prompts into waiting permission tool events', async () => {
    const harness = createHarness()
    const created = await harness.gateway.createRun(conversationContext())
    const manifest = harness.publisher.publications[0].manifest
    const signal = new AbortController()
    const streamed = collectEvents(
      harness.gateway.streamEvents(created.runId, signal.signal)
    )

    harness.runtime.sendUpdate(manifest.sessionId, {
      sessionUpdate: 'tool/call',
      data: {
        callId: 'call_approval_retry',
        name: 'bash',
        arguments: JSON.stringify({
          description: 'Retry approved write to requested path',
          command:
            "printf 'APPROVAL_SHOULD_WAIT' > '/workspace/test-space/side-effects/TC-P0-012-approval.txt'",
          sandbox_permissions: 'danger-full-access',
          justification:
            '需要一次更宽的文件访问授权。'
        })
      }
    })
    harness.runtime.sendUpdate(manifest.sessionId, {
      sessionUpdate: 'approval/asked',
      data: {
        id: 'approval-request-1',
        toolName: 'bash',
        callId: 'call_approval_retry',
        reason:
          'escalate sandbox to danger-full-access: 需要一次更宽的文件访问授权。'
      }
    })
    await flush()
    harness.runtime.resolvePrompt(manifest.sessionId, { stopReason: 'end_turn' })

    await expect(streamed).resolves.toEqual([
      expect.objectContaining({
        runId: created.runId,
        type: 'tool.call.requested',
        data: expect.objectContaining({
          callId: 'call_approval_retry',
          toolName: 'bash',
          category: 'command',
          argumentsSummary: expect.stringContaining(
            "printf 'APPROVAL_SHOULD_WAIT'"
          )
        })
      }),
      expect.objectContaining({
        runId: created.runId,
        type: 'tool.call.permission_required',
        data: {
          callId: 'call_approval_retry',
          toolExecutionId: 'approval-request-1',
          message:
            'escalate sandbox to danger-full-access: 需要一次更宽的文件访问授权。'
        }
      }),
      expect.objectContaining({
        runId: created.runId,
        type: 'run.completed'
      })
    ])
    expect(harness.ingestor.ingested).toHaveLength(0)
  })

  it('projects ACP tool results into completed tool events', async () => {
    const harness = createHarness()
    const created = await harness.gateway.createRun(conversationContext())
    const manifest = harness.publisher.publications[0].manifest
    const signal = new AbortController()
    const streamed = collectEvents(
      harness.gateway.streamEvents(created.runId, signal.signal)
    )

    harness.runtime.sendUpdate(manifest.sessionId, {
      sessionUpdate: 'tool/call',
      data: {
        callId: 'call_pwd',
        name: 'bash',
        arguments: JSON.stringify({
          command: 'pwd'
        })
      }
    })
    harness.runtime.sendUpdate(manifest.sessionId, {
      sessionUpdate: 'tool/result',
      data: {
        id: 'job_pwd',
        callId: 'call_pwd',
        toolName: 'bash',
        status: 'completed',
        output: {
          stdout: '/workspace/one\n',
          stderr: '',
          exitCode: 0
        }
      }
    })
    await flush()
    harness.runtime.resolvePrompt(manifest.sessionId, { stopReason: 'end_turn' })

    await expect(streamed).resolves.toEqual([
      expect.objectContaining({
        runId: created.runId,
        type: 'tool.call.requested',
        data: expect.objectContaining({
          callId: 'call_pwd',
          toolName: 'bash',
          category: 'command',
          argumentsSummary: expect.stringContaining('pwd')
        })
      }),
      expect.objectContaining({
        runId: created.runId,
        type: 'tool.call.completed',
        data: {
          callId: 'call_pwd',
          toolExecutionId: 'job_pwd',
          resultSummary: expect.stringContaining('/workspace/one')
        }
      }),
      expect.objectContaining({
        runId: created.runId,
        type: 'run.completed'
      })
    ])
    expect(harness.ingestor.ingested).toHaveLength(0)
  })

  it('fails the run when an ACP filesystem tool targets a path outside manifest roots', async () => {
    const harness = createHarness({ cancelSettlesPrompt: false })
    const created = await harness.gateway.createRun(conversationContext())
    const manifest = harness.publisher.publications[0].manifest
    const stream = harness.gateway.streamEvents(
      created.runId,
      new AbortController().signal
    )[Symbol.asyncIterator]()

    harness.runtime.sendUpdate(manifest.sessionId, {
      sessionUpdate: 'tool/call',
      data: {
        callId: 'call_read_outside_root',
        name: 'read',
        arguments: JSON.stringify({
          file_path: '/workspace/two/marker.txt'
        })
      }
    })

    await expect(stream.next()).resolves.toEqual({
      done: false,
      value: expect.objectContaining({
        runId: created.runId,
        type: 'tool.call.requested',
        data: expect.objectContaining({
          callId: 'call_read_outside_root',
          toolName: 'read',
          category: 'filesystem'
        })
      })
    })
    await expect(nextOrPending(stream)).resolves.toEqual({
      done: false,
      value: expect.objectContaining({
        runId: created.runId,
        type: 'tool.call.failed',
        data: expect.objectContaining({
          callId: 'call_read_outside_root',
          toolName: 'read',
          category: 'filesystem',
          errorCode: 'manifest_root_violation',
          message: 'Filesystem tool path is outside the manifest roots'
        })
      })
    })
    await expect(nextOrPending(stream)).resolves.toEqual({
      done: false,
      value: expect.objectContaining({
        runId: created.runId,
        type: 'run.failed',
        data: expect.objectContaining({
          errorCode: 'manifest_root_violation',
          message: 'Filesystem tool path is outside the manifest roots'
        })
      })
    })
    expect(harness.runtime.cancelledSessionIds).toEqual([manifest.sessionId])
    expect(harness.runtime.closedSessionIds).toEqual([manifest.sessionId])
  })

  it('allows ACP filesystem tool results that wrap an in-root path in XML-like tags', async () => {
    const harness = createHarness()
    const created = await harness.gateway.createRun(conversationContext())
    const manifest = harness.publisher.publications[0].manifest
    const signal = new AbortController()
    const streamed = collectEvents(
      harness.gateway.streamEvents(created.runId, signal.signal)
    )

    harness.runtime.sendUpdate(manifest.sessionId, {
      sessionUpdate: 'tool/call',
      data: {
        callId: 'call_read_inside_tagged_result',
        name: 'read',
        arguments: JSON.stringify({
          file_path: '/workspace/one/marker.txt'
        })
      }
    })
    harness.runtime.sendUpdate(manifest.sessionId, {
      sessionUpdate: 'tool/result',
      data: {
        id: 'job_read_inside_tagged_result',
        callId: 'call_read_inside_tagged_result',
        toolName: 'read',
        status: 'completed',
        resultSummary:
          '<path>/workspace/one/marker.txt</path>\n<content>allowed</content>'
      }
    })
    await flush()
    harness.runtime.resolvePrompt(manifest.sessionId, { stopReason: 'end_turn' })

    await expect(streamed).resolves.toEqual([
      expect.objectContaining({
        runId: created.runId,
        type: 'tool.call.requested',
        data: expect.objectContaining({
          callId: 'call_read_inside_tagged_result',
          toolName: 'read',
          category: 'filesystem'
        })
      }),
      expect.objectContaining({
        runId: created.runId,
        type: 'tool.call.completed',
        data: expect.objectContaining({
          callId: 'call_read_inside_tagged_result',
          toolExecutionId: 'job_read_inside_tagged_result',
          resultSummary: expect.stringContaining('/workspace/one/marker.txt')
        })
      }),
      expect.objectContaining({
        runId: created.runId,
        type: 'run.completed'
      })
    ])
  })

  it('fails the run when an ACP filesystem tool result reports a path outside manifest roots', async () => {
    const harness = createHarness({ cancelSettlesPrompt: false })
    const created = await harness.gateway.createRun(conversationContext())
    const manifest = harness.publisher.publications[0].manifest
    const stream = harness.gateway.streamEvents(
      created.runId,
      new AbortController().signal
    )[Symbol.asyncIterator]()

    harness.runtime.sendUpdate(manifest.sessionId, {
      sessionUpdate: 'tool/call',
      data: {
        callId: 'call_read_result_outside_root',
        name: 'read',
        arguments: JSON.stringify({
          file_path: '/workspace/one/marker.txt'
        })
      }
    })
    harness.runtime.sendUpdate(manifest.sessionId, {
      sessionUpdate: 'tool/result',
      data: {
        id: 'job_read_result_outside_root',
        callId: 'call_read_result_outside_root',
        toolName: 'read',
        status: 'completed',
        resultSummary: '<path>/workspace/two/marker.txt\n<content>secret</content>'
      }
    })

    await expect(stream.next()).resolves.toEqual({
      done: false,
      value: expect.objectContaining({
        runId: created.runId,
        type: 'tool.call.requested',
        data: expect.objectContaining({
          callId: 'call_read_result_outside_root',
          toolName: 'read',
          category: 'filesystem'
        })
      })
    })
    await expect(nextOrPending(stream)).resolves.toEqual({
      done: false,
      value: expect.objectContaining({
        runId: created.runId,
        type: 'tool.call.failed',
        data: expect.objectContaining({
          callId: 'call_read_result_outside_root',
          toolExecutionId: 'job_read_result_outside_root',
          toolName: 'read',
          category: 'filesystem',
          errorCode: 'manifest_root_violation',
          message: 'Filesystem tool path is outside the manifest roots'
        })
      })
    })
    await expect(nextOrPending(stream)).resolves.toEqual({
      done: false,
      value: expect.objectContaining({
        runId: created.runId,
        type: 'run.failed',
        data: expect.objectContaining({
          errorCode: 'manifest_root_violation',
          message: 'Filesystem tool path is outside the manifest roots'
        })
      })
    })
    expect(harness.runtime.cancelledSessionIds).toEqual([manifest.sessionId])
    expect(harness.runtime.closedSessionIds).toEqual([manifest.sessionId])
  })

  it('projects ACP process results with non-zero exit code as failed tool events', async () => {
    const harness = createHarness()
    const created = await harness.gateway.createRun(conversationContext())
    const manifest = harness.publisher.publications[0].manifest
    const signal = new AbortController()
    const streamed = collectEvents(
      harness.gateway.streamEvents(created.runId, signal.signal)
    )

    harness.runtime.sendUpdate(manifest.sessionId, {
      sessionUpdate: 'tool/call',
      data: {
        callId: 'call_failing_process',
        name: 'bash',
        arguments: JSON.stringify({
          command: "bash -lc 'echo TC-P0-020-EXPECTED-FAIL; exit 37'"
        })
      }
    })
    harness.runtime.sendUpdate(manifest.sessionId, {
      sessionUpdate: 'tool/result',
      data: {
        message: {
          id: 'job_failing_process',
          role: 'tool',
          toolCallId: 'call_failing_process',
          source: {
            kind: 'tool',
            callId: 'call_failing_process'
          },
          content: [
            {
              type: 'text',
              text: 'TC-P0-020-EXPECTED-FAIL\n[exit code: 37]'
            }
          ],
          isError: false
        }
      }
    })
    await flush()
    harness.runtime.resolvePrompt(manifest.sessionId, { stopReason: 'end_turn' })

    await expect(streamed).resolves.toEqual([
      expect.objectContaining({
        runId: created.runId,
        type: 'tool.call.requested',
        data: expect.objectContaining({
          callId: 'call_failing_process',
          toolName: 'bash',
          category: 'command',
          argumentsSummary: expect.stringContaining('exit 37')
        })
      }),
      expect.objectContaining({
        runId: created.runId,
        type: 'tool.call.failed',
        data: expect.objectContaining({
          callId: 'call_failing_process',
          toolExecutionId: 'job_failing_process',
          toolName: 'bash',
          category: 'command',
          errorCode: 'process_exit_code_37',
          message: expect.stringContaining('[exit code: 37]')
        })
      }),
      expect.objectContaining({
        runId: created.runId,
        type: 'run.completed'
      })
    ])
  })

  it('projects ACP subagent catalog entries into delegation update events', async () => {
    const harness = createHarness()
    const created = await harness.gateway.createRun(conversationContext())
    const manifest = harness.publisher.publications[0].manifest
    const signal = new AbortController()
    const streamed = collectEvents(
      harness.gateway.streamEvents(created.runId, signal.signal)
    )

    harness.runtime.sendUpdate(manifest.sessionId, {
      sessionUpdate: 'tool/call',
      data: {
        callId: 'call_subagent_readonly',
        name: 'subagent',
        arguments: JSON.stringify({
          description: 'Read-only workspace inspection',
          prompt: 'Inspect the current working directory without writing files.'
        })
      }
    })
    harness.runtime.sendUpdate(manifest.sessionId, {
      sessionUpdate: 'subagent/catalog',
      data: {
        childId: 'child-session-1',
        childCreatedAt: 1_800,
        mode: 'continuable',
        label: 'Read-only workspace inspection'
      }
    })
    await flush()
    harness.runtime.resolvePrompt(manifest.sessionId, { stopReason: 'end_turn' })

    await expect(streamed).resolves.toEqual([
      expect.objectContaining({
        runId: created.runId,
        type: 'tool.call.requested',
        data: expect.objectContaining({
          callId: 'call_subagent_readonly',
          toolName: 'subagent',
          category: 'agent'
        })
      }),
      expect.objectContaining({
        runId: created.runId,
        type: 'delegation.updated',
        data: {
          groupId: 'subagent:call_subagent_readonly',
          callId: 'call_subagent_readonly',
          parentRunId: created.runId,
          strategy: 'parallel',
          requestedAt: 1_800,
          children: [
            {
              taskId: 'child-session-1',
              childRunId: 'child-session-1',
              childSessionId: 'child-session-1',
              ordinal: 1,
              agentId: 'builtin.general',
              agentName: 'General',
              objective: 'Read-only workspace inspection',
              status: 'running',
              evidenceCount: 0,
              artifactIds: [],
              tree: []
            }
          ]
        }
      }),
      expect.objectContaining({
        runId: created.runId,
        type: 'run.completed'
      })
    ])
  })

  it('projects ACP subagent tool results into delegation updates when catalog updates are not streamed', async () => {
    const harness = createHarness()
    const created = await harness.gateway.createRun(conversationContext())
    const manifest = harness.publisher.publications[0].manifest
    const signal = new AbortController()
    const streamed = collectEvents(
      harness.gateway.streamEvents(created.runId, signal.signal)
    )

    harness.runtime.sendUpdate(manifest.sessionId, {
      sessionUpdate: 'tool/call',
      data: {
        callId: 'call_subagent_result_only',
        name: 'subagent',
        arguments: JSON.stringify({
          description: 'Read-only workdir check',
          prompt: 'Inspect the current working directory without writing files.'
        })
      }
    })
    harness.runtime.sendUpdate(manifest.sessionId, {
      sessionUpdate: 'tool/result',
      data: {
        message: {
          id: 'job_subagent_result_only',
          role: 'tool',
          toolCallId: 'call_subagent_result_only',
          source: {
            kind: 'tool',
            callId: 'call_subagent_result_only'
          },
          content: [
            {
              type: 'text',
              text: 'started subagent child-session-result-only'
            }
          ],
          isError: false
        }
      }
    })
    await flush()
    harness.runtime.resolvePrompt(manifest.sessionId, { stopReason: 'end_turn' })

    await expect(streamed).resolves.toEqual([
      expect.objectContaining({
        runId: created.runId,
        type: 'tool.call.requested',
        data: expect.objectContaining({
          callId: 'call_subagent_result_only',
          toolName: 'subagent',
          category: 'agent'
        })
      }),
      expect.objectContaining({
        runId: created.runId,
        type: 'tool.call.completed',
        data: {
          callId: 'call_subagent_result_only',
          toolExecutionId: 'job_subagent_result_only',
          resultSummary: 'started subagent child-session-result-only'
        }
      }),
      expect.objectContaining({
        runId: created.runId,
        type: 'delegation.updated',
        data: expect.objectContaining({
          groupId: 'subagent:call_subagent_result_only',
          callId: 'call_subagent_result_only',
          children: [
            expect.objectContaining({
              taskId: 'child-session-result-only',
              childRunId: 'child-session-result-only',
              childSessionId: 'child-session-result-only',
              objective: 'Read-only workdir check',
              status: 'running'
            })
          ]
        })
      }),
      expect.objectContaining({
        runId: created.runId,
        type: 'run.completed'
      })
    ])
  })

  it('projects ACP subagent completion messages into completed delegation updates', async () => {
    const harness = createHarness()
    const created = await harness.gateway.createRun(conversationContext())
    const manifest = harness.publisher.publications[0].manifest
    const signal = new AbortController()
    const streamed = collectEvents(
      harness.gateway.streamEvents(created.runId, signal.signal)
    )

    harness.runtime.sendUpdate(manifest.sessionId, {
      sessionUpdate: 'tool/call',
      data: {
        callId: 'call_subagent_complete',
        name: 'subagent',
        arguments: JSON.stringify({
          description: 'Read-only child report task',
          prompt: 'Send a completion summary back to the parent.'
        })
      }
    })
    harness.runtime.sendUpdate(manifest.sessionId, {
      sessionUpdate: 'subagent/catalog',
      data: {
        childId: 'child-session-complete',
        childCreatedAt: 1_800,
        mode: 'continuable',
        label: 'Read-only child report task'
      }
    })
    harness.runtime.sendUpdate(manifest.sessionId, {
      sessionUpdate: 'agent/inbox/spliced',
      type: 'agent/inbox/spliced',
      time: 2_400,
      data: {
        inserted: [
          {
            source: {
              kind: 'agent-message',
              senderSessionId: 'child-session-complete'
            },
            content: [
              {
                type: 'text',
                text: 'TC-P0-023 child completed'
              }
            ]
          }
        ]
      }
    })
    await flush()
    harness.runtime.resolvePrompt(manifest.sessionId, { stopReason: 'end_turn' })

    await expect(streamed).resolves.toEqual([
      expect.objectContaining({
        runId: created.runId,
        type: 'tool.call.requested',
        data: expect.objectContaining({
          callId: 'call_subagent_complete',
          toolName: 'subagent',
          category: 'agent'
        })
      }),
      expect.objectContaining({
        runId: created.runId,
        type: 'delegation.updated',
        data: expect.objectContaining({
          groupId: 'subagent:call_subagent_complete',
          callId: 'call_subagent_complete',
          children: [
            expect.objectContaining({
              taskId: 'child-session-complete',
              status: 'running'
            })
          ]
        })
      }),
      expect.objectContaining({
        runId: created.runId,
        type: 'delegation.updated',
        data: expect.objectContaining({
          groupId: 'subagent:call_subagent_complete',
          callId: 'call_subagent_complete',
          completedAt: 2_400,
          children: [
            expect.objectContaining({
              taskId: 'child-session-complete',
              childRunId: 'child-session-complete',
              childSessionId: 'child-session-complete',
              objective: 'Read-only child report task',
              status: 'completed',
              resultSummary: 'TC-P0-023 child completed',
              completedAt: 2_400
            })
          ]
        })
      }),
      expect.objectContaining({
        runId: created.runId,
        type: 'run.completed'
      })
    ])
  })

  it('ignores incomplete ACP tool calls until stored history provides the full payload', async () => {
    const harness = createHarness()
    const created = await harness.gateway.createRun(conversationContext())
    const manifest = harness.publisher.publications[0].manifest
    const signal = new AbortController()
    const streamed = collectEvents(
      harness.gateway.streamEvents(created.runId, signal.signal)
    )

    harness.runtime.sendUpdate(manifest.sessionId, {
      sessionUpdate: 'tool/call',
      data: {
        callId: 'call_without_payload'
      }
    })
    await flush()
    harness.runtime.resolvePrompt(manifest.sessionId, { stopReason: 'end_turn' })

    await expect(streamed).resolves.toEqual([
      expect.objectContaining({
        runId: created.runId,
        type: 'run.completed'
      })
    ])
  })

  it('hydrates ACP tool lifecycle from stored session history before terminal settlement', async () => {
    const harness = createHarness({
      historyCursor: 13,
      historyUpdates: [
        {
          sessionUpdate: 'tool/call',
          seq: 14,
          data: {
            callId: 'call_history_pwd',
            name: 'bash',
            arguments: JSON.stringify({
              description: 'Print current working directory',
              command: 'pwd'
            })
          }
        },
        {
          sessionUpdate: 'tool/result',
          seq: 17,
          data: {
            message: {
              id: 'job_history_pwd',
              role: 'tool',
              toolCallId: 'call_history_pwd',
              source: {
                kind: 'tool',
                callId: 'call_history_pwd'
              },
              content: [
                {
                  type: 'text',
                  text: '/workspace/one\n'
                }
              ],
              isError: false
            }
          }
        }
      ]
    })
    const created = await harness.gateway.createRun(conversationContext())
    const manifest = harness.publisher.publications[0].manifest
    const signal = new AbortController()
    const streamed = collectEvents(
      harness.gateway.streamEvents(created.runId, signal.signal)
    )

    harness.runtime.resolvePrompt(manifest.sessionId, { stopReason: 'end_turn' })

    await expect(streamed).resolves.toEqual([
      expect.objectContaining({
        runId: created.runId,
        type: 'tool.call.requested',
        data: expect.objectContaining({
          callId: 'call_history_pwd',
          toolName: 'bash',
          category: 'command',
          argumentsSummary: expect.stringContaining('pwd')
        })
      }),
      expect.objectContaining({
        runId: created.runId,
        type: 'tool.call.completed',
        data: {
          callId: 'call_history_pwd',
          toolExecutionId: 'job_history_pwd',
          resultSummary: '/workspace/one'
        }
      }),
      expect.objectContaining({
        runId: created.runId,
        type: 'run.completed'
      })
    ])
    expect(harness.runtime.historyReads).toEqual([
      {
        sessionId: manifest.sessionId,
        afterSequence: 13,
        limit: 200
      }
    ])
  })

  it('projects local cancellation before accepting late ACP chunks or end_turn settlement', async () => {
    const harness = createHarness({ cancelSettlesPrompt: false })
    const created = await harness.gateway.createRun(conversationContext())
    const manifest = harness.publisher.publications[0].manifest
    const signal = new AbortController()
    const streamed = collectEvents(
      harness.gateway.streamEvents(created.runId, signal.signal)
    )

    harness.runtime.sendUpdate(manifest.sessionId, {
      sessionUpdate: 'agent_message_chunk',
      content: {
        type: 'text',
        text: 'before cancel'
      }
    })
    await harness.gateway.cancelRun(created.runId)
    harness.runtime.sendUpdate(manifest.sessionId, {
      sessionUpdate: 'agent_message_chunk',
      content: {
        type: 'text',
        text: ' after cancel'
      }
    })
    harness.runtime.resolvePrompt(manifest.sessionId, { stopReason: 'end_turn' })

    await expect(streamed).resolves.toEqual([
      expect.objectContaining({
        runId: created.runId,
        type: 'answer.delta',
        data: { delta: 'before cancel' }
      }),
      expect.objectContaining({
        runId: created.runId,
        type: 'run.cancelled',
        data: { message: 'Run cancelled' }
      })
    ])
    expect(harness.runtime.cancelledSessionIds).toEqual([manifest.sessionId])
  })

  it('closes the parent ACP session after cancelling stored running subagent sessions', async () => {
    const harness = createHarness({
      cancelSettlesPrompt: false,
      historyUpdates: [
        {
          sessionUpdate: 'tool/call',
          seq: 11,
          data: {
            callId: 'call_subagent_cancel',
            name: 'subagent',
            arguments: JSON.stringify({
              description: 'Long cancellable child task',
              prompt: 'Start the child task and wait.'
            })
          }
        },
        {
          sessionUpdate: 'subagent/catalog',
          seq: 12,
          data: {
            childId: 'child-session-cancellable',
            childCreatedAt: 2_400,
            mode: 'continuable',
            label: 'Long cancellable child task'
          }
        }
      ]
    })
    const created = await harness.gateway.createRun(conversationContext())
    const manifest = harness.publisher.publications[0].manifest

    await harness.gateway.cancelRun(created.runId)

    expect(harness.runtime.historyReads).toEqual([
      {
        sessionId: manifest.sessionId,
        afterSequence: 0,
        limit: 200
      }
    ])
    expect(harness.runtime.cancelledSessionIds).toEqual([
      'child-session-cancellable',
      manifest.sessionId
    ])
    expect(harness.runtime.closedSessionIds).toEqual([
      'child-session-cancellable',
      manifest.sessionId
    ])

    harness.gateway.releaseRun(created.runId)
    await harness.gateway.createRun(conversationContext())

    expect(harness.runtime.resumedSessions).toEqual([
      {
        sessionId: manifest.sessionId,
        cwd: '/workspace/one',
        mcpServers: [{ name: 'realmflow-docs', url: 'http://127.0.0.1:7777/mcp' }]
      }
    ])
  })

  it('cancels same-workdir sessions created after run admission when child catalog is not projected yet', async () => {
    const harness = createHarness({ cancelSettlesPrompt: false })
    const created = await harness.gateway.createRun(conversationContext())
    const manifest = harness.publisher.publications[0].manifest
    harness.runtime.listedSessions.push({
      sessionId: 'child-session-unprojected',
      cwd: '/workspace/one'
    })

    await harness.gateway.cancelRun(created.runId)

    expect(harness.runtime.cancelledSessionIds).toEqual([
      'child-session-unprojected',
      manifest.sessionId
    ])
    expect(harness.runtime.closedSessionIds).toEqual([
      'child-session-unprojected',
      manifest.sessionId
    ])
  })

  it('projects local cancellation without waiting for ACP cancel acknowledgement', async () => {
    const harness = createHarness({
      cancelSettlesPrompt: false,
      cancelNeverResolves: true
    })
    const created = await harness.gateway.createRun(conversationContext())
    const manifest = harness.publisher.publications[0].manifest
    const stream = harness.gateway.streamEvents(
      created.runId,
      new AbortController().signal
    )[Symbol.asyncIterator]()

    const cancelling = harness.gateway.cancelRun(created.runId)

    await expect(
      Promise.race([
        cancelling.then(() => 'resolved'),
        flush().then(() => 'pending')
      ])
    ).resolves.toBe('resolved')
    await expect(stream.next()).resolves.toEqual({
      done: false,
      value: expect.objectContaining({
        runId: created.runId,
        type: 'run.cancelled',
        data: { message: 'Run cancelled' }
      })
    })
    expect(harness.runtime.cancelledSessionIds).toEqual([manifest.sessionId])
  })

  it('fails the run before accepting subagent calls above the manifest budget', async () => {
    const limitedAdmission = admission()
    limitedAdmission.manifestInput.budget = {
      ...limitedAdmission.manifestInput.budget,
      maxSubagents: 1
    }
    const harness = createHarness({
      admission: limitedAdmission,
      cancelSettlesPrompt: false
    })
    const created = await harness.gateway.createRun(conversationContext())
    const manifest = harness.publisher.publications[0].manifest
    const stream = harness.gateway.streamEvents(
      created.runId,
      new AbortController().signal
    )[Symbol.asyncIterator]()

    harness.runtime.sendUpdate(manifest.sessionId, subagentToolCall('call_subagent_1', 'Child 1'))
    await expect(stream.next()).resolves.toEqual({
      done: false,
      value: expect.objectContaining({
        runId: created.runId,
        type: 'tool.call.requested',
        data: expect.objectContaining({
          callId: 'call_subagent_1',
          toolName: 'subagent'
        })
      })
    })

    harness.runtime.sendUpdate(manifest.sessionId, subagentToolCall('call_subagent_2', 'Child 2'))
    await expect(stream.next()).resolves.toEqual({
      done: false,
      value: expect.objectContaining({
        runId: created.runId,
        type: 'tool.call.requested',
        data: expect.objectContaining({
          callId: 'call_subagent_2',
          toolName: 'subagent'
        })
      })
    })
    await expect(nextOrPending(stream)).resolves.toEqual({
      done: false,
      value: expect.objectContaining({
        runId: created.runId,
        type: 'tool.call.failed',
        data: expect.objectContaining({
          callId: 'call_subagent_2',
          errorCode: 'runtime_budget_exhausted',
          message: 'Subagent budget exhausted: maxSubagents=1'
        })
      })
    })
    await expect(nextOrPending(stream)).resolves.toEqual({
      done: false,
      value: expect.objectContaining({
        runId: created.runId,
        type: 'run.failed',
        data: expect.objectContaining({
          errorCode: 'runtime_budget_exhausted',
          message: 'Subagent budget exhausted: maxSubagents=1'
        })
      })
    })
    expect(harness.runtime.cancelledSessionIds).toEqual([manifest.sessionId])
    expect(harness.runtime.closedSessionIds).toEqual([manifest.sessionId])
  })
})

const runtimeInstanceId = 'dsh-runtime-main'
const runtimeBuildDigest = 'b'.repeat(64)

function createHarness(
  options: {
    admission?: DshAgentRunAdmission
    cancelSettlesPrompt?: boolean
    cancelNeverResolves?: boolean
    existingBinding?: DshSessionBinding
    historyCursor?: number
    historyUpdates?: DshAcpSessionUpdate[]
  } = {}
) {
  const log: string[] = []
  const runtime = new FakeDshRuntime(log, {
    cancelSettlesPrompt: options.cancelSettlesPrompt ?? true,
    cancelNeverResolves: options.cancelNeverResolves ?? false,
    historyCursor: options.historyCursor,
    historyUpdates: options.historyUpdates
  })
  const publisher = new FakeManifestPublisher(log)
  const sessions = new FakeDshSessionBindings(log, options.existingBinding)
  const ingestor = new FakeRuntimeEventIngestor()
  const runtimeRuns = {
    create: vi.fn(async (input: { runId: string }) => {
      log.push(`runtime-run.create:${input.runId}`)
    }),
    transition: vi.fn(async (input: {
      runId: string
      status: 'completed' | 'failed' | 'cancelled'
    }) => {
      log.push(`runtime-run.transition:${input.runId}:${input.status}`)
    })
  }
  const compiler = {
    compile: vi.fn(
      async (input: {
        runId: string
      }): Promise<DshAgentRunAdmission> => {
        log.push(`compile:${input.runId}`)
      return options.admission ?? admission()
      }
    )
  }
  const gateway = new DshAiRunGateway({
    runtime,
    runtimeIdentity: {
      runtimeInstanceId,
      runtimeBuildDigest
    },
    compiler,
    manifestPublisher: publisher,
    sessions,
    runtimeRuns,
    runtimeEvents: ingestor,
    manifestAcceptors: [
      acceptor(log, 'credential'),
      acceptor(log, 'product'),
      acceptor(log, 'events')
    ],
    createRunId: () => 'realmflow-run-1',
    now: () => 1_700
  })
  return {
    compiler,
    gateway,
    ingestor,
    log,
    publisher,
    runtime,
    runtimeRuns,
    sessions
  }
}

function conversationContext(): RunContext {
  return {
    conversationId: 'conversation-1',
    workspaceId: 'workspace-1',
    folderPath: '/workspace/one',
    messages: [{ role: 'user', content: 'Ship this feature' }],
    reasoning: 'high'
  }
}

function modelConfig(): ModelExecutionConfig {
  return {
    providerId: 'provider-openai',
    providerType: 'openai_responses',
    baseUrl: 'https://api.openai.com/v1',
    modelId: 'gpt-4.1',
    modelProfileId: 'profile-gpt',
    timeoutMs: 120_000,
    maxRetries: 2,
    maxConcurrency: 4
  }
}

function toolConfiguration(): RunToolConfiguration {
  return {
    maxAgentTurns: 4,
    maxParallelToolsPerTurn: 2,
    tools: []
  }
}

function admission(): DshAgentRunAdmission {
  return {
    cwd: '/workspace/one',
    mcpServers: [{ name: 'realmflow-docs', url: 'http://127.0.0.1:7777/mcp' }],
    prompt: [{ type: 'text', text: 'Ship this feature' }],
    manifestInput: {
      model: {
        kind: 'model',
        providerId: 'provider-openai',
        providerType: 'openai_responses',
        profileId: 'profile-gpt',
        modelId: 'gpt-4.1',
        reasoningEffort: 'high',
        credentialRef: 'credential-openai',
        options: {}
      },
      selectedToolIds: [],
      selectedSkillIds: [],
      authorizedToolRefs: [],
      authorizedSkillRefs: [],
      agents: [],
      mcpServers: [],
      connectors: [],
      context: {
        kind: 'context-access',
        scope: {
          kind: 'workspace',
          workspaceId: 'workspace-1'
        },
        roots: [
          {
            rootId: 'root-1',
            path: '/workspace/one',
            access: 'read-write'
          }
        ],
        attachments: []
      },
      knowledge: {
        kind: 'knowledge-runtime',
        enabled: false,
        scope: {
          kind: 'none'
        },
        snapshotId: 'knowledge-empty',
        workspaceIds: [],
        generationIds: [],
        embeddingProfile: {
          provider: 'local',
          model: 'Alibaba-NLP/gte-multilingual-base',
          revision: '2024-08-01',
          dimensions: 768,
          normalization: 'L2',
          distance: 'Cosine',
          profileDigest: '6'.repeat(64)
        },
        indexLease: {
          leaseId: 'lease-empty',
          collection: 'realmflow-empty',
          expiresAt: 2_000
        },
        limits: {
          maxQueries: 0,
          topKPerQuery: 0,
          maxReturnedChunks: 0,
          maxContextCharacters: 0
        }
      },
      policy: {
        kind: 'runtime-policy',
        approvalMode: 'protected',
        defaultDecision: 'deny',
        allowRuntimeWidening: false,
        toolPolicyDigest: '7'.repeat(64),
        maximumRisk: 'critical'
      },
      budget: {
        kind: 'runtime-budget',
        maxModelRequests: 32,
        maxToolCalls: 64,
        maxSubagents: 4,
        maxRuntimeMs: 900_000,
        maxRetries: 2,
        maxInputTokens: 256_000,
        maxOutputTokens: 32_000,
        maxCostUsd: 0
      },
      productCommands: [],
      credentialReferences: [
        {
          kind: 'credential-reference',
          ref: 'credential-openai',
          purpose: 'model'
        }
      ]
    }
  }
}

function acceptor(log: string[], label: string) {
  return {
    acceptRunManifest(input: { manifest: DshRunManifest }) {
      log.push(`accept:${label}:${input.manifest.sessionId}`)
    }
  }
}

function runtimeEvent(
  overrides: Partial<DshRuntimeEventEnvelope>
): DshRuntimeEventEnvelope {
  return {
    schemaVersion: 1,
    runtimeInstanceId,
    sessionId: 'dsh-session-1',
    runId: 'realmflow-run-1',
    manifestDigest: 'a'.repeat(64),
    owner: { workspaceId: 'workspace-1' },
    eventId: 'event-1',
    sequence: 1,
    kind: 'model.text_delta',
    occurredAt: 1_700,
    data: {},
    ...overrides
  }
}

async function collectEvents(iterable: AsyncIterable<unknown>) {
  const events: unknown[] = []
  for await (const event of iterable) {
    events.push(event)
    if (
      typeof event === 'object' &&
      event !== null &&
      'type' in event &&
      (event.type === 'run.completed' ||
        event.type === 'run.failed' ||
        event.type === 'run.cancelled')
    ) {
      break
    }
  }
  return events
}

function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

async function nextOrPending(
  stream: AsyncIterator<AiRunEvent>
): Promise<IteratorResult<AiRunEvent> | { done: false; value: 'pending' }> {
  return Promise.race([
    stream.next(),
    flush().then(() => ({ done: false as const, value: 'pending' as const }))
  ])
}

function subagentToolCall(callId: string, description: string): DshAcpSessionUpdate {
  return {
    sessionUpdate: 'tool/call',
    data: {
      callId,
      name: 'subagent',
      arguments: JSON.stringify({
        description,
        prompt: `Return ${description}`
      })
    }
  }
}

class FakeManifestPublisher {
  readonly inputs: Array<DshRunManifestPublisherInput> = []
  readonly publications: Array<{ manifest: DshRunManifest }> = []

  constructor(private readonly log: string[]) {}

  async publish(
    input: DshRunManifestPublisherInput
  ): Promise<{ manifest: DshRunManifest; manifestId: string; digest: string }> {
    this.inputs.push(input)
    this.log.push(`manifest.publish:${input.runId}:${input.sessionId}`)
    const manifest = sealDshRunManifest({
      schemaVersion: 1,
      manifestId: `manifest-${input.runId}`,
      runId: input.runId,
      sessionId: input.sessionId,
      owner: input.owner,
      model: input.model!,
      tools: [],
      skills: [],
      agents: input.agents ?? [],
      mcpServers: input.mcpServers ?? [],
      connectors: input.connectors ?? [],
      context: input.context,
      knowledge: input.knowledge,
      policy: input.policy,
      budget: input.budget,
      productCommands: input.productCommands,
      credentialReferences: input.credentialReferences
    })
    const publication = {
      manifest,
      manifestId: manifest.manifestId,
      digest: manifest.digest
    }
    this.publications.push(publication)
    return publication
  }
}

class FakeDshSessionBindings {
  readonly saved: DshSessionBinding[] = []
  private binding: DshSessionBinding | undefined

  constructor(
    private readonly log: string[],
    existingBinding?: DshSessionBinding
  ) {
    this.binding = existingBinding
  }

  async getByOwner(_owner: DshRunOwner): Promise<DshSessionBinding | undefined> {
    if (this.binding?.ownerKey !== dshRunOwnerKey(_owner)) return undefined
    return this.binding
  }

  async save(binding: DshSessionBinding): Promise<void> {
    this.log.push(`session.save:${binding.dshSessionId}`)
    this.binding = binding
    this.saved.push(binding)
  }
}

class FakeRuntimeEventIngestor {
  readonly ingested: DshRuntimeEventEnvelope[] = []

  async ingest(
    event: DshRuntimeEventEnvelope
  ): Promise<DshRuntimeEventIngestionResult> {
    this.ingested.push(event)
    return {
      status: 'projected',
      cursor: event.sequence,
      projection: {
        schemaVersion: 1,
        eventId: event.eventId,
        kind: event.kind,
        runtimeInstanceId: event.runtimeInstanceId,
        sessionId: event.sessionId,
        runId: event.runId,
        sequence: event.sequence,
        placements: [],
        assistantRunEvent: {
          id: event.eventId,
          runId: event.runId,
          sequence: event.sequence,
          type: 'answer.delta',
          timestamp: event.occurredAt,
          data: {
            delta: String(event.data.delta)
          }
        }
      } satisfies DshRuntimeEventProjectionResult
    }
  }
}

class FakeDshRuntime {
  readonly newSessions: Array<{
    cwd: string
    mcpServers?: unknown[]
  }> = []
  readonly resumedSessions: Array<{
    sessionId: string
    cwd: string
    mcpServers?: unknown[]
  }> = []
  readonly prompts: Array<{
    sessionId: string
    prompt: unknown[]
  }> = []
  readonly historyReads: Array<{
    sessionId: string
    afterSequence: number
    limit: number
  }> = []
  readonly listedSessions: Array<{
    sessionId: string
    cwd: string
  }> = []
  readonly listSessionCalls: Array<{
    cwd?: string
    cursor?: string
  }> = []
  readonly cancelledSessionIds: string[] = []
  readonly closedSessionIds: string[] = []
  readonly syncedModelCredentialProviderIds: string[] = []
  private readonly sessionCwds = new Map<string, string>()
  private readonly handlers = new Map<string, Set<(update: DshAcpSessionUpdate) => void>>()
  private readonly promptResolvers = new Map<
    string,
    (response: { stopReason: string }) => void
  >()

  constructor(
    private readonly log: string[],
    private readonly options: {
      cancelSettlesPrompt: boolean
      cancelNeverResolves: boolean
      historyCursor?: number
      historyUpdates?: DshAcpSessionUpdate[]
    }
  ) {}

  async start(): Promise<void> {
    this.log.push('runtime.start')
  }

  async syncModelCredentials(input: ModelExecutionConfig): Promise<void> {
    if (
      input.providerId === 'builtin-deepseek' ||
      input.catalogProviderId === 'deepseek'
    ) {
      this.syncedModelCredentialProviderIds.push(input.providerId ?? 'unknown')
      this.log.push(`credential.sync:${input.providerId}`)
    }
  }

  async newSession(input: {
    cwd: string
    mcpServers?: unknown[]
  }): Promise<{ sessionId: string }> {
    this.newSessions.push(input)
    this.log.push(`session.new:${input.cwd}`)
    this.sessionCwds.set('dsh-session-1', input.cwd)
    return { sessionId: 'dsh-session-1' }
  }

  async resumeSession(input: {
    sessionId: string
    cwd: string
    mcpServers?: unknown[]
  }): Promise<Record<string, never>> {
    this.resumedSessions.push(input)
    this.log.push(`session.resume:${input.sessionId}`)
    this.sessionCwds.set(input.sessionId, input.cwd)
    return {}
  }

  async closeSession(input: {
    sessionId: string
  }): Promise<Record<string, never>> {
    this.closedSessionIds.push(input.sessionId)
    return {}
  }

  async listSessions(input: {
    cwd?: string
    cursor?: string
  } = {}): Promise<{
    sessions: Array<{
      sessionId: string
      cwd: string
    }>
    nextCursor?: string
  }> {
    this.listSessionCalls.push(input)
    const sessions = [
      ...[...this.sessionCwds.entries()].map(([sessionId, cwd]) => ({
        sessionId,
        cwd
      })),
      ...this.listedSessions
    ].filter((session) => input.cwd === undefined || session.cwd === input.cwd)
    return { sessions }
  }

  async setConfigOption(input: {
    sessionId: string
    configId: string
    value: unknown
  }): Promise<Record<string, never>> {
    this.log.push(`config:${input.configId}=${String(input.value)}`)
    return {}
  }

  prompt(input: {
    sessionId: string
    prompt: unknown[]
  }): Promise<{ stopReason: string }> {
    this.prompts.push(input)
    this.log.push(`prompt:${input.sessionId}`)
    return new Promise((resolve) => {
      this.promptResolvers.set(input.sessionId, resolve)
    })
  }

  async getSessionUpdateCursor(_input: {
    sessionId: string
  }): Promise<number> {
    return this.options.historyCursor ?? 0
  }

  async readSessionUpdates(input: {
    sessionId: string
    afterSequence: number
    limit: number
  }): Promise<{
    updates: DshAcpSessionUpdate[]
    nextAfterSequence: number
    hasMore: boolean
  }> {
    this.historyReads.push(input)
    const updates = (this.options.historyUpdates ?? []).filter((update) => {
      const sequence = typeof update.seq === 'number' ? update.seq : 0
      return sequence > input.afterSequence
    }).slice(0, input.limit)
    return {
      updates,
      nextAfterSequence: updates.reduce((cursor, update) => {
        const sequence = typeof update.seq === 'number' ? update.seq : cursor
        return Math.max(cursor, sequence)
      }, input.afterSequence),
      hasMore: false
    }
  }

  async cancel(input: { sessionId: string }): Promise<void> {
    this.cancelledSessionIds.push(input.sessionId)
    this.log.push(`cancel:${input.sessionId}`)
    if (this.options.cancelNeverResolves) {
      return new Promise(() => undefined)
    }
    if (this.options.cancelSettlesPrompt) {
      this.resolvePrompt(input.sessionId, { stopReason: 'cancelled' })
    }
  }

  onSessionUpdate(
    sessionId: string,
    handler: (update: DshAcpSessionUpdate) => void
  ): () => void {
    const handlers = this.handlers.get(sessionId) ?? new Set()
    handlers.add(handler)
    this.handlers.set(sessionId, handlers)
    return () => {
      handlers.delete(handler)
    }
  }

  sendUpdate(sessionId: string, update: DshAcpSessionUpdate): void {
    for (const handler of this.handlers.get(sessionId) ?? []) handler(update)
  }

  resolvePrompt(sessionId: string, response: { stopReason: string }): void {
    const resolve = this.promptResolvers.get(sessionId)
    if (resolve === undefined) return
    this.promptResolvers.delete(sessionId)
    resolve(response)
  }
}
