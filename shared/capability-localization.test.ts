import { describe, expect, it } from 'vitest'
import {
  localizeBuiltinCapability,
  resolveCapabilityDisplay
} from './capability-localization'

describe('capability localization', () => {
  it('uses exact, language, default, then canonical metadata', () => {
    const metadata = {
      'zh-CN': { name: '读取文件', description: '读取工作区文件' },
      zh: { name: '读取文件（通用）', description: '读取文件' },
      en: { name: 'Read file', description: 'Read a workspace file' }
    }

    expect(
      resolveCapabilityDisplay(
        { name: 'Read file', description: 'Read a workspace file' },
        metadata,
        'zh-CN',
        'en'
      )
    ).toMatchObject({ name: '读取文件', resolvedLocale: 'zh-CN' })
    expect(
      resolveCapabilityDisplay(
        { name: 'Read file', description: 'Read a workspace file' },
        metadata,
        'zh-HK',
        'en'
      )
    ).toMatchObject({ name: '读取文件（通用）', resolvedLocale: 'zh' })
    expect(
      resolveCapabilityDisplay(
        { name: 'Read file', description: 'Read a workspace file' },
        {},
        'ja',
        'en'
      )
    ).toMatchObject({ name: 'Read file', resolvedLocale: 'canonical' })
  })

  it('creates localized display text for RealmFlow-owned capabilities', () => {
    expect(
      localizeBuiltinCapability(
        'builtin.documents.read',
        {
          name: 'Read document',
          description: 'Extract text from a local document'
        },
        'zh-CN'
      )
    ).toEqual({
      name: '读取文档',
      description: 'RealmFlow 内置能力：读取文档',
      requestedLocale: 'zh-CN',
      resolvedLocale: 'zh-CN'
    })
    expect(
      localizeBuiltinCapability(
        'builtin.documents.read',
        {
          name: 'Read document',
          description: 'Extract text from a local document'
        },
        'ja'
      ).name
    ).toBe('ドキュメントを読み取る')
  })
})
