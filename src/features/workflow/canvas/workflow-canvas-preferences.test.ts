import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_WORKFLOW_CANVAS_PREFERENCES,
  loadWorkflowCanvasPreferences,
  saveWorkflowCanvasPreferences,
  workflowCanvasPreferenceKey
} from './workflow-canvas-preferences'

describe('workflow canvas preferences', () => {
  beforeEach(() => window.localStorage.clear())

  it('stores versioned viewport and inspector preferences by template version', () => {
    const preferences = {
      version: 1 as const,
      viewport: { x: -120, y: 45, zoom: 1.25 },
      inspector: { open: false, width: 392 },
      minimapVisible: false
    }

    expect(
      saveWorkflowCanvasPreferences(
        'template-1-v2',
        preferences,
        window.localStorage
      )
    ).toBe(true)
    expect(
      loadWorkflowCanvasPreferences('template-1-v2', window.localStorage)
    ).toEqual(preferences)
    expect(
      loadWorkflowCanvasPreferences('template-1-v1', window.localStorage)
    ).toEqual(DEFAULT_WORKFLOW_CANVAS_PREFERENCES)
  })

  it('falls back when stored data is corrupt or outside supported bounds', () => {
    const key = workflowCanvasPreferenceKey('template-1-v1')
    for (const value of [
      '{broken',
      JSON.stringify({
        version: 2,
        viewport: { x: 0, y: 0, zoom: 1 },
        inspector: { open: true, width: 360 },
        minimapVisible: true
      }),
      JSON.stringify({
        version: 1,
        viewport: { x: 0, y: 0, zoom: 99 },
        inspector: { open: true, width: 360 },
        minimapVisible: true
      }),
      JSON.stringify({
        version: 1,
        viewport: { x: Number.NaN, y: 0, zoom: 1 },
        inspector: { open: true, width: 900 },
        minimapVisible: true
      })
    ]) {
      window.localStorage.setItem(key, value)
      expect(
        loadWorkflowCanvasPreferences('template-1-v1', window.localStorage)
      ).toEqual(DEFAULT_WORKFLOW_CANVAS_PREFERENCES)
    }
  })

  it('survives unavailable browser storage', () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error('unavailable')
      }),
      setItem: vi.fn(() => {
        throw new Error('unavailable')
      })
    } as unknown as Storage

    expect(loadWorkflowCanvasPreferences('template-1-v1', storage)).toEqual(
      DEFAULT_WORKFLOW_CANVAS_PREFERENCES
    )
    expect(
      saveWorkflowCanvasPreferences(
        'template-1-v1',
        DEFAULT_WORKFLOW_CANVAS_PREFERENCES,
        storage
      )
    ).toBe(false)
  })
})
