import { describe, expect, it } from 'vitest'
import { projectProviderToolSchema } from './provider-tool-schema'

describe('projectProviderToolSchema', () => {
  it('removes conditional composition while preserving base object fields', () => {
    const projected = projectProviderToolSchema({
      type: 'object',
      additionalProperties: false,
      required: ['action'],
      properties: {
        action: {
          type: 'string',
          enum: ['status', 'create_proposal']
        },
        definition: { type: 'object', additionalProperties: true }
      },
      allOf: [{
        if: {
          properties: {
            action: { const: 'create_proposal' }
          }
        },
        then: { required: ['definition'] }
      }]
    })

    expect(projected).toEqual({
      type: 'object',
      additionalProperties: false,
      required: ['action'],
      properties: {
        action: {
          type: 'string',
          enum: ['status', 'create_proposal']
        },
        definition: { type: 'object', additionalProperties: true }
      }
    })
    expect(JSON.stringify(projected)).not.toMatch(
      /"allOf"|"if"|"then"/
    )
  })

  it('merges object alternatives into a permissive provider schema', () => {
    const projected = projectProviderToolSchema({
      oneOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['action'],
          properties: {
            action: { const: 'get' }
          }
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['action', 'objective'],
          properties: {
            action: { const: 'update' },
            objective: { type: 'string', minLength: 1 }
          }
        }
      ]
    })

    expect(projected).toEqual({
      type: 'object',
      additionalProperties: false,
      required: ['action'],
      properties: {
        action: { enum: ['get', 'update'] },
        objective: { type: 'string', minLength: 1 }
      }
    })
  })

  it('broadens scalar alternatives for provider compatibility', () => {
    expect(projectProviderToolSchema({
      description: 'Patch value',
      oneOf: [
        { type: 'string' },
        { type: 'number' },
        { type: 'boolean' },
        { type: 'null' }
      ]
    })).toEqual({
      description: 'Patch value'
    })
  })
})
