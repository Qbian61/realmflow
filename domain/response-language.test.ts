import { describe, expect, it } from 'vitest'
import {
  ProviderRoundTextBuffer,
  assessResponseLanguage,
  responseLanguagePolicy,
  resolveResponseLanguage
} from './response-language'

describe('response language', () => {
  it('prefers an explicit language instruction over message composition', () => {
    expect(resolveResponseLanguage('Please answer in Chinese. Thanks.'))
      .toMatchObject({ locale: 'zh-CN', source: 'explicit_user_instruction' })
  })

  it('detects the dominant natural language while ignoring code', () => {
    expect(
      resolveResponseLanguage('请修复下面的问题：`const value = "hello"`')
    ).toMatchObject({ locale: 'zh-CN', source: 'latest_user_message' })
    expect(resolveResponseLanguage('Fix the failing checkout test.'))
      .toMatchObject({ locale: 'en', source: 'latest_user_message' })
  })

  it('builds a trusted policy without interpolating user text', () => {
    const policy = responseLanguagePolicy({
      locale: 'zh-CN',
      source: 'latest_user_message',
      confidence: 0.9,
      allowMixedLanguage: false
    })

    expect(policy).toContain('使用简体中文')
    expect(policy).toContain('代码、命令、路径、API 名称')
  })

  it('rejects clearly mismatched prose while ignoring code and paths', () => {
    const snapshot = resolveResponseLanguage('请修复这个问题')

    expect(
      assessResponseLanguage(
        'I will inspect the repository and update the implementation.',
        snapshot
      )
    ).toBe('mismatch')
    expect(
      assessResponseLanguage(
        '已更新 `src/app.ts`，并保留 API 名称 getUserProfile。',
        snapshot
      )
    ).toBe('match')
  })

  it('classifies text from a Tool round as a public summary', () => {
    const buffer = new ProviderRoundTextBuffer(
      resolveResponseLanguage('请分析项目')
    )
    buffer.append('我会先检查相关文件。')
    buffer.markToolCall()

    expect(buffer.flush()).toEqual({
      kind: 'summary',
      text: '我会先检查相关文件。',
      language: 'match'
    })
  })

  it('blocks mismatched public summaries before they reach the UI', () => {
    const buffer = new ProviderRoundTextBuffer(
      resolveResponseLanguage('请分析项目')
    )
    buffer.append('I will inspect the files first.')
    buffer.markToolCall()

    expect(buffer.flush()).toEqual({
      kind: 'summary',
      text: '',
      language: 'mismatch'
    })
  })
})
