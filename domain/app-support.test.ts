import {
  SUPPORT_LINK_TARGETS,
  compareStableVersions,
  createUpdateCheckRecord,
  isSupportLinkTarget,
  parseStableVersion
} from './app-support'

describe('app support domain', () => {
  it.each([
    ['1.2.3', [1, 2, 3]],
    ['v10.20.30', [10, 20, 30]],
    ['0.0.0', [0, 0, 0]]
  ])('parses stable version %s', (value, expected) => {
    expect(parseStableVersion(value)).toEqual(expected)
  })

  it.each([
    '',
    '1.2',
    '1.2.3.4',
    '1.2.3-beta.1',
    'v1.2.3+build',
    'V1.2.3',
    '01.2.3',
    '1.-2.3',
    '9007199254740992.0.0'
  ])('rejects non-stable version %s', (value) => {
    expect(() => parseStableVersion(value)).toThrow(
      'Stable version is invalid'
    )
  })

  it.each([
    ['1.10.0', '1.9.9', 1],
    ['v2.0.0', '2.0.0', 0],
    ['0.9.9', '1.0.0', -1]
  ])('compares %s with %s numerically', (left, right, expected) => {
    expect(compareStableVersions(left, right)).toBe(expected)
  })

  it('creates a successful update check record', () => {
    expect(
      createUpdateCheckRecord({
        requestId: 'update:request-1',
        currentVersion: '1.2.3',
        latestVersion: 'v1.3.0',
        status: 'update_available',
        checkedAt: 123
      })
    ).toEqual({
      requestId: 'update:request-1',
      currentVersion: '1.2.3',
      latestVersion: '1.3.0',
      status: 'update_available',
      checkedAt: 123
    })
  })

  it('creates a failed update check record without response details', () => {
    expect(
      createUpdateCheckRecord({
        requestId: 'update:request-2',
        currentVersion: '1.2.3',
        status: 'failed',
        errorCode: 'request_timeout',
        checkedAt: 456
      })
    ).toEqual({
      requestId: 'update:request-2',
      currentVersion: '1.2.3',
      status: 'failed',
      errorCode: 'request_timeout',
      checkedAt: 456
    })
  })

  it.each([
    {
      requestId: 'bad request',
      currentVersion: '1.2.3',
      latestVersion: '1.3.0',
      status: 'update_available',
      checkedAt: 1
    },
    {
      requestId: 'request-1',
      currentVersion: '1.2.3',
      status: 'up_to_date',
      checkedAt: 1
    },
    {
      requestId: 'request-1',
      currentVersion: '1.2.3',
      latestVersion: '1.2.3',
      status: 'failed',
      errorCode: 'invalid_response',
      checkedAt: 1
    },
    {
      requestId: 'request-1',
      currentVersion: '1.2.3',
      status: 'failed',
      checkedAt: 1
    },
    {
      requestId: 'request-1',
      currentVersion: '1.2.3',
      latestVersion: '1.2.3',
      status: 'up_to_date',
      errorCode: 'service_rejected',
      checkedAt: 1
    },
    {
      requestId: 'request-1',
      currentVersion: '1.2.3',
      latestVersion: '1.2.3',
      status: 'up_to_date',
      checkedAt: -1
    },
    {
      requestId: 'request-1',
      currentVersion: '1.2.3',
      latestVersion: '1.2.2',
      status: 'update_available',
      checkedAt: 1
    },
    {
      requestId: 'request-1',
      currentVersion: '1.2.3',
      latestVersion: '1.2.4',
      status: 'up_to_date',
      checkedAt: 1
    }
  ])('rejects an invalid update record %#', (input) => {
    expect(() =>
      createUpdateCheckRecord(
        input as Parameters<typeof createUpdateCheckRecord>[0]
      )
    ).toThrow()
  })

  it('exposes only the fixed support link targets', () => {
    expect(SUPPORT_LINK_TARGETS).toEqual([
      'website',
      'online_help',
      'feedback',
      'releases'
    ])
    expect(isSupportLinkTarget('feedback')).toBe(true)
    expect(isSupportLinkTarget('https://example.com')).toBe(false)
  })
})
