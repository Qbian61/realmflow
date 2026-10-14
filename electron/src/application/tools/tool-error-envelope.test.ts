import { describe, expect, it } from 'vitest'
import {
  createToolExecutionError,
  normalizeToolExecutionError
} from './tool-error-envelope'

describe('tool error envelope', () => {
  it('classifies public errors with stable F08 categories and safe retryability', () => {
    expect(
      normalizeToolExecutionError({
        code: 'tool_arguments_invalid',
        message: 'Invalid argument path=/Users/alice/private token=secret',
        retryable: true
      })
    ).toMatchObject({
      code: 'tool_arguments_invalid',
      category: 'invalid_input',
      retryable: false,
      publicMessage: 'Tool arguments are invalid',
      diagnosticId: expect.stringMatching(/^toolerr_[a-f0-9]{16}$/)
    })

    expect(
      createToolExecutionError(
        Object.assign(new Error('outside the authorized scope /tmp/private'), {
          code: 'tool_scope_mismatch'
        })
      )
    ).toMatchObject({
      code: 'tool_scope_mismatch',
      category: 'scope',
      retryable: false,
      publicMessage: 'Tool path is outside the authorized scope'
    })

    expect(
      createToolExecutionError(
        Object.assign(
          new Error(
            'Git repository is outside the authorized scope: /Users/alice/private'
          ),
          { code: 'git_repository_outside_scope' }
        )
      )
    ).toMatchObject({
      code: 'git_repository_outside_scope',
      category: 'scope',
      retryable: false,
      publicMessage:
        'Git repository is outside the authorized scope. Choose the repository folder as the scope root.',
      recoveryHint: 'Choose the repository folder as the scope root.'
    })

    expect(
      normalizeToolExecutionError({
        code: 'connector_credential_unavailable',
        message: 'Credential token=secret is unavailable',
        retryable: false
      })
    ).toMatchObject({
      code: 'connector_credential_unavailable',
      category: 'unavailable',
      retryable: false,
      publicMessage: 'Tool runtime is unavailable'
    })

    expect(
      normalizeToolExecutionError({
        code: 'runtime_resource_stale',
        message: 'Current browser session is stale at /Users/alice/run',
        retryable: false
      })
    ).toMatchObject({
      code: 'runtime_resource_stale',
      category: 'transient',
      retryable: true,
      publicMessage: 'Runtime resource is stale for the current run'
    })
  })

  it('recomputes legacy adapter categories instead of persisting them', () => {
    expect(
      normalizeToolExecutionError({
        code: 'tool_policy_denied',
        message: 'Denied by policy',
        retryable: true,
        category: 'policy'
      } as unknown as Parameters<typeof normalizeToolExecutionError>[0])
    ).toMatchObject({
      code: 'tool_policy_denied',
      category: 'scope',
      retryable: false,
      publicMessage: 'Denied by policy'
    })
  })
})
