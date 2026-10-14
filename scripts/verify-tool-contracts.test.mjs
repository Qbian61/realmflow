import { describe, expect, it } from 'vitest'
import {
  compareBuiltinHandlerContracts,
  validateModelInputSchema
} from './verify-tool-contracts.mjs'

describe('verify-tool-contracts', () => {
  it('reports deterministic builtin handler manifest drift', () => {
    const diagnostics = compareBuiltinHandlerContracts(
      [
        {
          id: 'builtin.files.read',
          file: 'resources/extensions/builtin/files/tools/builtin-files-read.json',
          handlerKey: 'files.read@1.0.0'
        },
        {
          id: 'builtin.git.status',
          file: 'resources/extensions/builtin/git/tools/builtin-git-status.json',
          handlerKey: 'git.status@2.0.0'
        }
      ],
      [
        {
          name: 'files.read',
          version: '1.0.0',
          file: 'electron/src/application/tools/builtin-file-tool-handlers.ts'
        },
        {
          name: 'web.fetch',
          version: '1.0.0',
          file: 'electron/src/application/tools/builtin-web-tool-handlers.ts'
        }
      ]
    )

    expect(diagnostics).toEqual([
      {
        code: 'builtin_handler_unregistered',
        file: 'resources/extensions/builtin/git/tools/builtin-git-status.json',
        message:
          'builtin.git.status references missing handler git.status@2.0.0'
      },
      {
        code: 'builtin_handler_without_definition',
        file: 'electron/src/application/tools/builtin-web-tool-handlers.ts',
        message: 'web.fetch@1.0.0 has no builtin Tool definition'
      }
    ])
  })

  it('requires every model-visible input property to be described', () => {
    expect(
      validateModelInputSchema(
        {
          type: 'object',
          additionalProperties: false,
          required: ['query'],
          properties: {
            query: { type: 'string' }
          }
        },
        'fixtures/search.json'
      )
    ).toEqual([
      {
        code: 'input_property_description_missing',
        file: 'fixtures/search.json',
        message: '#/inputSchema/properties/query.description is required'
      }
    ])
  })

  it('rejects placeholder descriptions for migrated builtin parameters', () => {
    expect(
      validateModelInputSchema(
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            offset: {
              type: 'integer',
              description:
                'offset argument for builtin.files.read; provide the value required by this tool contract.'
            }
          }
        },
        'fixtures/files-read.json'
      )
    ).toEqual([
      {
        code: 'input_property_description_placeholder',
        file: 'fixtures/files-read.json',
        message:
          '#/inputSchema/properties/offset.description must be specific and must not use placeholder wording'
      }
    ])
  })

  it('requires schema examples to validate against the input schema', () => {
    expect(
      validateModelInputSchema(
        {
          type: 'object',
          additionalProperties: false,
          required: ['query'],
          properties: {
            query: {
              type: 'string',
              description: 'Search query supplied by the user or current task.'
            }
          }
        },
        'fixtures/web-search.json',
        { requireExamples: true }
      )
    ).toEqual([
      {
        code: 'input_examples_missing',
        file: 'fixtures/web-search.json',
        message: '#/inputSchema.examples is required'
      }
    ])

    expect(
      validateModelInputSchema(
        {
          type: 'object',
          additionalProperties: false,
          required: ['query'],
          examples: [{ query: 123 }],
          properties: {
            query: {
              type: 'string',
              description: 'Search query supplied by the user or current task.'
            }
          }
        },
        'fixtures/web-search.json',
        { requireExamples: true }
      )
    ).toEqual([
      {
        code: 'input_examples_invalid',
        file: 'fixtures/web-search.json',
        message: '#/inputSchema/examples/0 must validate against the input schema'
      }
    ])
  })

  it('requires examples to cover every top-level model-visible input property', () => {
    expect(
      validateModelInputSchema(
        {
          type: 'object',
          additionalProperties: false,
          required: ['query'],
          examples: [{ query: 'release notes' }],
          properties: {
            query: {
              type: 'string',
              description: 'Search query supplied by the user or current task.'
            },
            limit: {
              type: 'integer',
              description: 'Maximum number of search results returned.'
            }
          }
        },
        'fixtures/web-search.json',
        { requireTopLevelPropertyExamples: true }
      )
    ).toEqual([
      {
        code: 'input_property_examples_missing',
        file: 'fixtures/web-search.json',
        message:
          '#/inputSchema/properties/limit.examples is required or inputSchema.examples must cover it'
      }
    ])
  })

  it('requires sourceKinds to tell models to use repository instead of code', () => {
    expect(
      validateModelInputSchema(
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            sourceKinds: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['file', 'repository']
              },
              description: 'Knowledge source kinds to include.'
            }
          }
        },
        'fixtures/knowledge-search.json'
      )
    ).toEqual([
      {
        code: 'input_source_kinds_repository_semantics',
        file: 'fixtures/knowledge-search.json',
        message:
          '#/inputSchema/properties/sourceKinds.description must say repository means code repositories and code is not a valid sourceKind'
      }
    ])
  })

  it('requires scopeRoot to use the canonical current-root wording', () => {
    expect(
      validateModelInputSchema(
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            scopeRoot: {
              type: 'string',
              description:
                'Optional authorized root override. Omit to use the current root; "." means the current authorized root.'
            }
          }
        },
        'fixtures/files-read.json'
      )
    ).toEqual([
      {
        code: 'input_scope_root_current_authorized_root_guidance',
        file: 'fixtures/files-read.json',
        message:
          '#/inputSchema/properties/scopeRoot.description must include: Omit or pass "." to use the current authorized root'
      }
    ])
  })

  it('requires path fields to prefer relative paths and reject invented absolute paths', () => {
    expect(
      validateModelInputSchema(
        {
          type: 'object',
          additionalProperties: false,
          required: ['path'],
          properties: {
            path: {
              type: 'string',
              description:
                'Authorized local path resolved inside the current authorized root.'
            }
          }
        },
        'fixtures/files-read.json'
      )
    ).toEqual([
      {
        code: 'input_path_authorized_relative_guidance',
        file: 'fixtures/files-read.json',
        message:
          '#/inputSchema/properties/path.description must say to use a relative path under the authorized root and not invent absolute local paths'
      }
    ])
  })

  it('requires expectedRevision fields to identify the trusted source', () => {
    expect(
      validateModelInputSchema(
        {
          type: 'object',
          additionalProperties: false,
          required: ['expectedRevision'],
          properties: {
            expectedRevision: {
              type: 'integer',
              description:
                'Expected open-session revision used for optimistic concurrency control.'
            }
          }
        },
        'fixtures/node-answer.json'
      )
    ).toEqual([
      {
        code: 'input_revision_trusted_source_guidance',
        file: 'fixtures/node-answer.json',
        message:
          '#/inputSchema/properties/expectedRevision.description must say to copy the value from the latest RealmFlow UI/API state and not invent it'
      }
    ])
  })

  it('requires idempotencyKey fields to explain retry reuse and new intent keys', () => {
    expect(
      validateModelInputSchema(
        {
          type: 'object',
          additionalProperties: false,
          required: ['idempotencyKey'],
          properties: {
            idempotencyKey: {
              type: 'string',
              description:
                'Caller-provided key that makes a retry or replay safe and deduplicated.'
            }
          }
        },
        'fixtures/knowledge-refresh.json'
      )
    ).toEqual([
      {
        code: 'input_idempotency_key_reuse_guidance',
        file: 'fixtures/knowledge-refresh.json',
        message:
          '#/inputSchema/properties/idempotencyKey.description must say to reuse the same key for retries of the same user request and use a new key for a different user intent'
      }
    ])
  })
})
