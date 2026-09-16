import { normalizeWebUrl } from './web-url'

describe('normalizeWebUrl', () => {
  it('adds https to a hostname without a protocol', () => {
    expect(normalizeWebUrl('example.com/docs')).toBe('https://example.com/docs')
  })

  it('allows explicit http and https URLs', () => {
    expect(normalizeWebUrl('http://localhost:3000')).toBe(
      'http://localhost:3000/'
    )
    expect(normalizeWebUrl('https://example.com')).toBe('https://example.com/')
  })

  it.each(['javascript:alert(1)', 'file:///tmp/private', 'data:text/html,test'])(
    'rejects unsupported URL scheme: %s',
    (url) => {
      expect(() => normalizeWebUrl(url)).toThrow(
        'Only HTTP and HTTPS URLs are supported'
      )
    }
  )
})
