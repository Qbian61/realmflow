import Ajv2020 from 'ajv/dist/2020.js'
import { describe, expect, it } from 'vitest'
import { projectProviderToolSchema } from './provider-tool-schema'

describe('projectProviderToolSchema', () => {
  it('preserves conditional required constraints for provider validation', () => {
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

    const validate = new Ajv2020({ strict: true }).compile(projected)
    expect(validate({ action: 'status' })).toBe(true)
    expect(validate({
      action: 'create_proposal',
      definition: { name: 'workflow' }
    })).toBe(true)
    expect(validate({ action: 'create_proposal' })).toBe(false)
  })

  it('preserves object alternatives for provider validation', () => {
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

    const validate = new Ajv2020({ strict: true }).compile(projected)
    expect(validate({ action: 'get' })).toBe(true)
    expect(validate({ action: 'update', objective: 'Ship F03' })).toBe(true)
    expect(validate({ action: 'update' })).toBe(false)
  })

  it('keeps action-specific argument branches narrower than runtime validation', () => {
    const projected = projectProviderToolSchema({
      type: 'object',
      additionalProperties: false,
      required: ['action', 'arguments'],
      properties: {
        action: { type: 'string', enum: ['read', 'search'] },
        arguments: {
          type: 'object',
          additionalProperties: false,
          properties: {
            path: { type: 'string', minLength: 1 },
            query: { type: 'string', minLength: 1 }
          }
        }
      },
      oneOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['action', 'arguments'],
          properties: {
            action: { const: 'read' },
            arguments: {
              type: 'object',
              additionalProperties: false,
              required: ['path'],
              properties: {
                path: { type: 'string', minLength: 1 }
              }
            }
          }
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['action', 'arguments'],
          properties: {
            action: { const: 'search' },
            arguments: {
              type: 'object',
              additionalProperties: false,
              required: ['query'],
              properties: {
                query: { type: 'string', minLength: 1 }
              }
            }
          }
        }
      ]
    })

    const validate = new Ajv2020({ strict: true }).compile(projected)
    expect(validate({ action: 'read', arguments: { path: 'docs/a.md' } }))
      .toBe(true)
    expect(validate({ action: 'search', arguments: { query: 'routing' } }))
      .toBe(true)
    expect(validate({ action: 'read', arguments: { query: 'routing' } }))
      .toBe(false)
    expect(validate({ action: 'delete', arguments: { path: 'docs/a.md' } }))
      .toBe(false)
  })

  it('preserves scalar alternatives for provider validation', () => {
    const projected = projectProviderToolSchema({
      description: 'Patch value',
      oneOf: [
        { type: 'string' },
        { type: 'number' },
        { type: 'boolean' },
        { type: 'null' }
      ]
    })

    const validate = new Ajv2020({ strict: true }).compile(projected)
    expect(validate('text')).toBe(true)
    expect(validate(42)).toBe(true)
    expect(validate(true)).toBe(true)
    expect(validate(null)).toBe(true)
    expect(validate({ value: 'text' })).toBe(false)
  })
})
