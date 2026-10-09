import { describe, expect, it, vi } from 'vitest'
import {
  loadProductAnalyticsPreferences,
  saveProductAnalyticsPreferences
} from './product-analytics-preferences'

describe('product analytics preferences', () => {
  it('defaults to the product view', () => {
    const storage = { getItem: vi.fn().mockReturnValue(null) } as unknown as Storage

    expect(loadProductAnalyticsPreferences(storage)).toEqual({
      view: 'product'
    })
  })

  it('round trips the selected view and workspace', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value))
    } as unknown as Storage

    saveProductAnalyticsPreferences(
      { view: 'models', workspaceId: 'workspace-1' },
      storage
    )

    expect(loadProductAnalyticsPreferences(storage)).toEqual({
      view: 'models',
      workspaceId: 'workspace-1'
    })
  })

  it('round trips the Runtime governance view', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value))
    } as unknown as Storage

    saveProductAnalyticsPreferences({ view: 'governance' }, storage)

    expect(loadProductAnalyticsPreferences(storage)).toEqual({
      view: 'governance'
    })
  })

  it.each([
    '{',
    JSON.stringify({ version: 2, view: 'product' }),
    JSON.stringify({ version: 1, view: 'unknown' }),
    JSON.stringify({ version: 1, view: 'product', workspaceId: ' ' }),
    JSON.stringify({ version: 1, view: 'product', unexpected: true })
  ])('falls back when stored data is invalid: %s', (stored) => {
    const storage = {
      getItem: vi.fn().mockReturnValue(stored)
    } as unknown as Storage

    expect(loadProductAnalyticsPreferences(storage)).toEqual({
      view: 'product'
    })
  })
})
