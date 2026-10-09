import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_MODEL_STATISTICS_PREFERENCES,
  loadModelStatisticsPreferences,
  saveModelStatisticsPreferences
} from './model-statistics-preferences'

describe('model statistics preferences', () => {
  beforeEach(() => window.localStorage.clear())

  it('uses defaults when preferences are absent or corrupt', () => {
    expect(loadModelStatisticsPreferences()).toEqual(
      DEFAULT_MODEL_STATISTICS_PREFERENCES
    )

    window.localStorage.setItem(
      'realmflow:model-statistics-filters:v1',
      '{broken'
    )
    expect(loadModelStatisticsPreferences()).toEqual(
      DEFAULT_MODEL_STATISTICS_PREFERENCES
    )
  })

  it('round trips supported non-sensitive filter preferences', () => {
    const preferences = {
      timeRange: '90d' as const,
      groupBy: 'requirement' as const,
      providerId: 'provider-1',
      modelProfileId: 'model-1',
      workspaceId: 'workspace-1',
      requirementId: 'requirement-1',
      nodeId: 'node-1',
      conversationId: 'conversation-1'
    }

    saveModelStatisticsPreferences(preferences)

    expect(loadModelStatisticsPreferences()).toEqual(preferences)
  })

  it('drops invalid values and unknown fields', () => {
    window.localStorage.setItem(
      'realmflow:model-statistics-filters:v1',
      JSON.stringify({
        timeRange: 'year',
        groupBy: 'day',
        providerId: '',
        modelProfileId: 1,
        secret: 'must-not-survive'
      })
    )

    expect(loadModelStatisticsPreferences()).toEqual(
      DEFAULT_MODEL_STATISTICS_PREFERENCES
    )
  })
})
