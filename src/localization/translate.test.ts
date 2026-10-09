import { describe, expect, it } from 'vitest'
import { translate } from './translate'

describe('translate', () => {
  it('returns the selected locale message', () => {
    expect(translate('en', 'settings.title')).toBe('Settings')
    expect(translate('ja', 'settings.title')).toBe('設定')
  })

  it('localizes the tools and skills navigation label', () => {
    expect(translate('zh-CN', 'navigation.capabilities')).toBe(
      '能力'
    )
    expect(translate('en', 'navigation.capabilities')).toBe(
      'Capabilities'
    )
    expect(translate('ja', 'navigation.capabilities')).toBe(
      '機能'
    )
  })

  it('falls back to Simplified Chinese for a missing translation', () => {
    expect(translate('en', 'localization.fallbackProbe')).toBe('回退验证')
    expect(translate('ja', 'localization.fallbackProbe')).toBe('回退验证')
  })

  it('interpolates named values without changing unknown placeholders', () => {
    expect(
      translate('en', 'workspace.deleteWarning', {
        name: 'Alpha'
      })
    ).toBe(
      'Deleting workspace "Alpha" also permanently deletes its requirements.'
    )
    expect(
      translate('en', 'workspace.deleteWarning', {})
    ).toContain('{name}')
  })

  it('localizes template migration states in every supported locale', () => {
    expect(translate('zh-CN', 'templateMigration.confirm')).toBe('确认迁移')
    expect(translate('en', 'templateMigration.noCandidates')).toBe(
      'No newer version is available'
    )
    expect(translate('ja', 'templateMigration.conflictRefreshed')).toBe(
      'ワークフローが変更されたため、移行プレビューを更新しました。'
    )
    expect(
      translate('en', 'templateMigration.topologyCount', {
        nodeCount: 3,
        edgeCount: 2
      })
    ).toBe('3 nodes · 2 edges')
  })

  it('localizes every requirement DAG toolbar action', () => {
    expect(translate('zh-CN', 'requirementDagToolbar.focusCurrentNode')).toBe(
      '定位当前节点'
    )
    expect(translate('en', 'requirementDagToolbar.enterEditMode')).toBe(
      'Edit topology'
    )
    expect(translate('ja', 'requirementDagToolbar.migrateTemplate')).toBe(
      'テンプレートを移行'
    )
  })
})
