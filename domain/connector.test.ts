import { describe, expect, it } from 'vitest'
import {
  createConnector,
  updateConnector,
  type Connector
} from './connector'

const baseInput = {
  id: 'connector-docs',
  name: ' Docs ',
  type: 'http' as const,
  baseUrl: 'https://docs.example.com/api/',
  authentication: { type: 'bearer' as const },
  enabled: true,
  timeoutMs: 30_000,
  maxRetries: 2,
  at: 100
}

describe('Connector', () => {
  it('normalizes a secure HTTP connector without exposing credentials', () => {
    expect(createConnector(baseInput)).toEqual({
      id: 'connector-docs',
      name: 'Docs',
      type: 'http',
      baseUrl: 'https://docs.example.com/api',
      authentication: { type: 'bearer' },
      enabled: true,
      timeoutMs: 30_000,
      maxRetries: 2,
      revision: 1,
      createdAt: 100,
      updatedAt: 100
    })
  })

  it('allows plain HTTP only for loopback connectors', () => {
    expect(
      createConnector({
        ...baseInput,
        baseUrl: 'http://127.0.0.1:8787/'
      }).baseUrl
    ).toBe('http://127.0.0.1:8787')

    expect(() =>
      createConnector({
        ...baseInput,
        baseUrl: 'http://docs.example.com'
      })
    ).toThrow('Connector URL must use HTTPS')
  })

  it.each([
    'ftp://docs.example.com',
    'https://user:secret@docs.example.com',
    'https://docs.example.com/#fragment'
  ])('rejects unsafe base URL %s', (baseUrl) => {
    expect(() => createConnector({ ...baseInput, baseUrl })).toThrow(
      'Connector URL is invalid'
    )
  })

  it('requires a valid header name only for API key header authentication', () => {
    expect(
      createConnector({
        ...baseInput,
        authentication: {
          type: 'api_key_header',
          headerName: ' X-API-Key '
        }
      }).authentication
    ).toEqual({ type: 'api_key_header', headerName: 'X-API-Key' })

    expect(() =>
      createConnector({
        ...baseInput,
        authentication: { type: 'api_key_header', headerName: 'Bad Header' }
      })
    ).toThrow('Connector authentication header is invalid')
  })

  it.each([
    { timeoutMs: 0, maxRetries: 2 },
    { timeoutMs: 600_001, maxRetries: 2 },
    { timeoutMs: 30_000, maxRetries: -1 },
    { timeoutMs: 30_000, maxRetries: 11 }
  ])('rejects invalid execution limits %#', (limits) => {
    expect(() => createConnector({ ...baseInput, ...limits })).toThrow(
      'Connector execution limits are invalid'
    )
  })

  it('updates mutable configuration and increments revision', () => {
    const current: Connector = createConnector(baseInput)

    expect(
      updateConnector(current, {
        name: 'Docs v2',
        type: 'http',
        baseUrl: 'https://docs.example.com/v2',
        authentication: { type: 'none' },
        enabled: false,
        timeoutMs: 45_000,
        maxRetries: 0,
        at: 200
      })
    ).toEqual({
      ...current,
      name: 'Docs v2',
      baseUrl: 'https://docs.example.com/v2',
      authentication: { type: 'none' },
      enabled: false,
      timeoutMs: 45_000,
      maxRetries: 0,
      revision: 2,
      updatedAt: 200
    })
  })
})
