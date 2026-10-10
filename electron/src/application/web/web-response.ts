import { createHash } from 'node:crypto'
import { isIP } from 'node:net'

export type WebRequestPort = typeof fetch
export const hashWebContent = (value: string | Uint8Array) =>
  `sha256:${createHash('sha256').update(value).digest('hex')}`

export function webError(code: string): Error & { code: string } {
  return Object.assign(new Error(code), { code })
}

export function parseWebUrl(value: string): URL {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error()
    return url
  } catch { throw webError('web_url_invalid') }
}

export function assertPublicUrl(url: URL): void {
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  const [first = 0, second = 0] = host.split('.').map(Number)
  const privateV4 = isIP(host) === 4 && (
    first === 0 || first === 10 || first === 127 || first >= 224 ||
    (first === 169 && second === 254) || (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) || (first === 100 && second >= 64 && second <= 127)
  )
  const privateV6 = isIP(host) === 6 && (
    host === '::' || host === '::1' || host.startsWith('fc') ||
    host.startsWith('fd') || /^fe[89ab]/.test(host) || host.startsWith('::ffff:')
  )
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
      privateV4 || privateV6) throw webError('web_private_network_blocked')
}

export function sanitizeWebUrl(url: URL): string {
  const next = new URL(url)
  const auth = next.username || next.password ? '[redacted]@' : ''
  const sensitive = /(?:^|[_-])(?:api[_-]?key|access[_-]?token|auth|authorization|credential|key|password|secret|session|token)(?:$|[_-])/i
  const query = [...next.searchParams].map(([key, value]) =>
    `${encodeURIComponent(key)}=${sensitive.test(key) ? '[redacted]' : encodeURIComponent(value)}`
  ).join('&')
  return `${next.protocol}//${auth}${next.host}${next.pathname}${query ? `?${query}` : ''}${next.hash ? '#[redacted]' : ''}`
}

/** The deadline spans headers, redirects and the complete bounded body read. */
export async function readWebResponse(input: {
  request: WebRequestPort
  url: URL
  signal: AbortSignal
  timeoutMs: number
  maxBytes: number
  maxRedirects: number
  headers?: HeadersInit
  publicOnly?: boolean
}): Promise<{ response: Response; finalUrl: URL; bytes: Uint8Array; truncated: boolean }> {
  const controller = new AbortController()
  const cancelled = () => controller.abort(new DOMException('Cancelled', 'AbortError'))
  if (input.signal.aborted) cancelled()
  else input.signal.addEventListener('abort', cancelled, { once: true })
  const timer = setTimeout(() => controller.abort(webError('web_timeout')), input.timeoutMs)
  const aborted = () => {
    if (controller.signal.aborted) throw controller.signal.reason
  }
  const race = <T>(operation: Promise<T>): Promise<T> => new Promise((resolve, reject) => {
    const abort = () => reject(controller.signal.reason)
    controller.signal.addEventListener('abort', abort, { once: true })
    if (controller.signal.aborted) abort()
    operation.then(resolve, reject).finally(() => controller.signal.removeEventListener('abort', abort))
  })
  try {
    let url = new URL(input.url)
    for (let redirects = 0; ; redirects++) {
      aborted()
      if (input.publicOnly) assertPublicUrl(url)
      const requestUrl = new URL(url)
      requestUrl.username = ''
      requestUrl.password = ''
      const response = await race(input.request(requestUrl, {
        method: 'GET', redirect: 'manual', signal: controller.signal,
        headers: input.headers
      }))
      if (response.status >= 300 && response.status < 400) {
        void response.body?.cancel().catch(() => {})
        const location = response.headers.get('location')
        if (!location || redirects >= input.maxRedirects) throw webError('web_redirect_limit')
        const next = parseWebUrl(new URL(location, url).href)
        if (next.origin !== input.url.origin) throw webError('web_redirect_origin_changed')
        url = next
        continue
      }
      const finalUrl = response.url ? parseWebUrl(response.url) : url
      if (finalUrl.origin !== input.url.origin) throw webError('web_redirect_origin_changed')
      if (input.publicOnly) assertPublicUrl(finalUrl)
      if (Number(response.headers.get('content-length')) > input.maxBytes) {
        void response.body?.cancel().catch(() => {})
        throw webError('web_response_too_large')
      }
      const chunks: Uint8Array[] = []
      let size = 0
      let truncated = false
      const reader = response.body?.getReader()
      if (reader) {
        try {
          while (true) {
            aborted()
            const chunk = await race(reader.read())
            if (chunk.done) break
            const remaining = input.maxBytes - size
            chunks.push(chunk.value.slice(0, remaining))
            size += Math.min(remaining, chunk.value.byteLength)
            if (chunk.value.byteLength > remaining) {
              truncated = true
              break
            }
          }
        } finally {
          void reader.cancel().catch(() => {})
          reader.releaseLock()
        }
      }
      aborted()
      return { response, finalUrl, bytes: Buffer.concat(chunks, size), truncated }
    }
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason
    if (error instanceof Error && 'code' in error && String(error.code).startsWith('web_')) throw error
    throw webError('web_fetch_failed')
  } finally {
    clearTimeout(timer)
    input.signal.removeEventListener('abort', cancelled)
  }
}
