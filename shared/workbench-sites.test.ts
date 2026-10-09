import { describe, expect, it } from 'vitest'
import {
  normalizeWorkbenchSiteUrl,
  parseCreateWorkbenchSiteCommand,
  parseUpdateWorkbenchSiteCommand
} from './workbench-sites'

describe('workbench sites contract', () => {
  it('normalizes http and https URLs', () => {
    expect(normalizeWorkbenchSiteUrl(' realmflow.dev/docs ')).toBe(
      'https://realmflow.dev/docs'
    )
    expect(normalizeWorkbenchSiteUrl('http://localhost:3000')).toBe(
      'http://localhost:3000/'
    )
  })

  it('rejects non-web protocols and credential-bearing URLs', () => {
    expect(() => normalizeWorkbenchSiteUrl('file:///tmp/private')).toThrow(
      'protocol'
    )
    expect(() =>
      normalizeWorkbenchSiteUrl('https://user:secret@example.com')
    ).toThrow('credentials')
  })

  it('validates create and revision-based update commands', () => {
    expect(
      parseCreateWorkbenchSiteCommand({
        requestId: ' request-1 ',
        name: ' RealmFlow ',
        url: 'realmflow.dev',
        groupId: 'group-1',
        openMode: 'embedded'
      })
    ).toEqual({
      requestId: 'request-1',
      name: 'RealmFlow',
      url: 'https://realmflow.dev/',
      groupId: 'group-1',
      openMode: 'embedded'
    })

    expect(
      parseUpdateWorkbenchSiteCommand({
        requestId: 'request-2',
        siteId: 'site-1',
        expectedRevision: 3,
        openMode: 'external',
        position: 20
      })
    ).toEqual({
      requestId: 'request-2',
      siteId: 'site-1',
      expectedRevision: 3,
      openMode: 'external',
      position: 20
    })
    expect(() =>
      parseUpdateWorkbenchSiteCommand({
        requestId: 'request-2',
        siteId: 'site-1',
        expectedRevision: -1
      })
    ).toThrow('expectedRevision')
  })
})
