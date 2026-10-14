import { createHash } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import {
  request as httpRequest,
  type IncomingHttpHeaders,
  type RequestOptions
} from 'node:http'
import { request as httpsRequest } from 'node:https'
import { isIP } from 'node:net'
import { Readable } from 'node:stream'

export type WebRequestPort = typeof fetch
export type WebResolvedAddress = { address: string; family: 4 | 6 }
export type WebHostResolver = (
  hostname: string
) => Promise<readonly WebResolvedAddress[]>
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
  const host = normalizedHostname(url)
  const privateAddress = isIP(host) !== 0 && !isPublicIpAddress(host)
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
      privateAddress) throw webError('web_private_network_blocked')
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
  resolveHost?: WebHostResolver
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
      const publicAddresses = input.publicOnly
        ? await resolvePublicAddresses(url, input.resolveHost)
        : undefined
      const requestUrl = new URL(url)
      requestUrl.username = ''
      requestUrl.password = ''
      const response = await race(
        requestWebResponse(
          input.request,
          requestUrl,
          {
            method: 'GET',
            redirect: 'manual',
            signal: controller.signal,
            headers: webRequestHeaders(input.headers, redirects > 0)
          },
          publicAddresses
        )
      )
      if (response.status >= 300 && response.status < 400) {
        void response.body?.cancel().catch(() => {})
        const location = response.headers.get('location')
        if (!location || redirects >= input.maxRedirects) throw webError('web_redirect_limit')
        const next = parseWebUrl(new URL(location, url).href)
        if (input.publicOnly) assertPublicUrl(next)
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

async function requestWebResponse(
  request: WebRequestPort,
  url: URL,
  init: RequestInit,
  publicAddresses: readonly WebResolvedAddress[] | undefined
): Promise<Response> {
  if (publicAddresses && request === fetch) {
    return requestPinnedPublicUrl(url, init, publicAddresses)
  }
  return request(url, init)
}

async function resolvePublicAddresses(
  url: URL,
  resolveHost: WebHostResolver = defaultResolveHost
): Promise<readonly WebResolvedAddress[]> {
  assertPublicUrl(url)
  const host = normalizedHostname(url)
  const addresses = await resolveHost(host)
  if (addresses.length === 0) throw webError('web_dns_unavailable')
  for (const { address } of addresses) {
    if (!isPublicIpAddress(address)) throw webError('web_private_network_blocked')
  }
  return addresses
}

async function defaultResolveHost(
  hostname: string
): Promise<readonly WebResolvedAddress[]> {
  const family = isIP(hostname)
  if (family === 4 || family === 6) {
    return [{ address: hostname, family }]
  }
  try {
    const records = await lookup(hostname, { all: true, verbatim: true })
    return records
      .filter((record) => record.family === 4 || record.family === 6)
      .map((record) => ({
        address: record.address,
        family: record.family as 4 | 6
      }))
  } catch {
    throw webError('web_dns_unavailable')
  }
}

function requestPinnedPublicUrl(
  url: URL,
  init: RequestInit,
  publicAddresses: readonly WebResolvedAddress[]
): Promise<Response> {
  const request = url.protocol === 'https:' ? httpsRequest : httpRequest
  const options: RequestOptions = {
    method: init.method,
    headers: nodeHeaders(init.headers),
    signal: init.signal as AbortSignal,
    lookup: createPinnedLookup(publicAddresses)
  }
  return new Promise((resolve, reject) => {
    const outgoing = request(url, options, (incoming) => {
      const remoteAddress = incoming.socket.remoteAddress
      if (remoteAddress && !isPublicIpAddress(remoteAddress)) {
        const error = webError('web_private_network_blocked')
        incoming.destroy(error)
        reject(error)
        return
      }
      resolve(
        new Response(Readable.toWeb(incoming) as ReadableStream, {
          status: incoming.statusCode ?? 200,
          statusText: incoming.statusMessage,
          headers: responseHeaders(incoming.headers)
        })
      )
    })
    outgoing.on('error', reject)
    outgoing.end()
  })
}

function createPinnedLookup(
  publicAddresses: readonly WebResolvedAddress[]
): RequestOptions['lookup'] {
  return (_hostname, options, callback) => {
    const cb = typeof options === 'function' ? options : callback
    if (!cb) return
    const family =
      typeof options === 'object' &&
      options !== null &&
      'family' in options &&
      (options.family === 4 || options.family === 6)
        ? options.family
        : undefined
    const candidates = family
      ? publicAddresses.filter((address) => address.family === family)
      : publicAddresses
    if (candidates.length === 0) {
      cb(webError('web_private_network_blocked'), '', 0)
      return
    }
    if (
      typeof options === 'object' &&
      options !== null &&
      'all' in options &&
      options.all === true
    ) {
      ;(
        cb as (
          error: NodeJS.ErrnoException | null,
          addresses: Array<{ address: string; family: number }>
        ) => void
      )(null, candidates.map((address) => ({ ...address })))
      return
    }
    cb(null, candidates[0]!.address, candidates[0]!.family)
  }
}

function nodeHeaders(headers: HeadersInit | undefined): Record<string, string> {
  const output: Record<string, string> = {}
  new Headers(headers).forEach((value, key) => {
    output[key] = value
  })
  return output
}

const SENSITIVE_REDIRECT_HEADER =
  /^(?:authorization|proxy-authorization|cookie|cookie2|set-cookie|referer|x-(?:api-key|auth-token|subscription-token)|.*(?:api-key|credential|password|secret|token).*)$/i

function webRequestHeaders(
  headers: HeadersInit | undefined,
  redirected: boolean
): HeadersInit | undefined {
  if (!headers || !redirected) return headers
  const output = new Headers(headers)
  for (const key of [...output.keys()]) {
    if (SENSITIVE_REDIRECT_HEADER.test(key)) output.delete(key)
  }
  return output
}

function responseHeaders(headers: IncomingHttpHeaders): Headers {
  const output = new Headers()
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      for (const item of value) output.append(key, item)
    } else if (value !== undefined) {
      output.set(key, value)
    }
  }
  return output
}

function normalizedHostname(url: URL): string {
  return url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
}

function isPublicIpAddress(value: string): boolean {
  const host = value.toLowerCase().replace(/^\[|\]$/g, '')
  const family = isIP(host)
  if (family === 4) return isPublicIpv4(host)
  if (family === 6) return isPublicIpv6(host)
  return false
}

function isPublicIpv4(host: string): boolean {
  const parts = host.split('.').map(Number)
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false
  }
  const [first, second, third] = parts as [number, number, number, number]
  return !(
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 192 && second === 0) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113)
  )
}

function isPublicIpv6(host: string): boolean {
  const hextets = parseIpv6Hextets(host)
  if (!hextets) return false
  if (
    hextets.every((hextet) => hextet === 0) ||
    isIpv6Loopback(hextets) ||
    isIpv4MappedIpv6(hextets) ||
    isIpv4CompatibleIpv6(hextets)
  ) {
    return false
  }
  const [first, second] = hextets as [number, number, ...number[]]
  if (isWellKnownNat64(hextets)) return isPublicIpv4(embeddedIpv4(hextets, 6))
  if (first === 0x2002) return isPublicIpv4(embeddedIpv4(hextets, 1))
  return !(
    first === 0 ||
    (first & 0xfe00) === 0xfc00 ||
    (first & 0xffc0) === 0xfe80 ||
    (first & 0xff00) === 0xff00 ||
    isIpv6DiscardPrefix(hextets) ||
    (first === 0x2001 && (second === 0 || second === 0x0002 || second === 0x0db8))
  )
}

function parseIpv6Hextets(host: string): number[] | undefined {
  if (host.includes('%') || host.includes('.')) return undefined
  const sections = host.split('::')
  if (sections.length > 2) return undefined
  const head = parseIpv6Section(sections[0] ?? '')
  const tail = sections.length === 2 ? parseIpv6Section(sections[1] ?? '') : []
  if (!head || !tail) return undefined
  const missing = 8 - head.length - tail.length
  if (sections.length === 1 && missing !== 0) return undefined
  if (sections.length === 2 && missing < 1) return undefined
  return [...head, ...Array.from({ length: missing }, () => 0), ...tail]
}

function parseIpv6Section(section: string): number[] | undefined {
  if (!section) return []
  const segments = section.split(':')
  const hextets: number[] = []
  for (const segment of segments) {
    if (!/^[0-9a-f]{1,4}$/i.test(segment)) return undefined
    hextets.push(Number.parseInt(segment, 16))
  }
  return hextets
}

function isIpv6Loopback(hextets: readonly number[]): boolean {
  return hextets.slice(0, 7).every((hextet) => hextet === 0) &&
    hextets[7] === 1
}

function isIpv4MappedIpv6(hextets: readonly number[]): boolean {
  return hextets.slice(0, 5).every((hextet) => hextet === 0) &&
    hextets[5] === 0xffff
}

function isIpv4CompatibleIpv6(hextets: readonly number[]): boolean {
  return hextets.slice(0, 6).every((hextet) => hextet === 0) &&
    (hextets[6] !== 0 || hextets[7] !== 0)
}

function isWellKnownNat64(hextets: readonly number[]): boolean {
  return hextets[0] === 0x0064 &&
    hextets[1] === 0xff9b &&
    hextets.slice(2, 6).every((hextet) => hextet === 0)
}

function isIpv6DiscardPrefix(hextets: readonly number[]): boolean {
  return hextets[0] === 0x0100 &&
    hextets.slice(1, 4).every((hextet) => hextet === 0)
}

function embeddedIpv4(hextets: readonly number[], start: number): string {
  const high = hextets[start] ?? 0
  const low = hextets[start + 1] ?? 0
  return `${high >>> 8}.${high & 0xff}.${low >>> 8}.${low & 0xff}`
}
