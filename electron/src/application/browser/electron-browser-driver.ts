import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type { BrowserAction, BrowserDriver, BrowserSession } from './browser-runtime-port'
import { setTimeout as delay } from 'node:timers/promises'
import { ScopePathResolver } from '../tools/scope-path-resolver'
import { BrowserArtifacts, browserUrl, MAX_BROWSER_ARTIFACT_BYTES, publicBrowserUrl } from './browser-artifacts'
import {
  BrowserCdpPage,
  boundedBrowserWork,
  type BrowserPageHost
} from './browser-cdp-page'
import { createBrowserWindow, evaluateBrowserSnapshot } from './electron-browser-window'

export class ElectronBrowserDriver implements BrowserDriver {
  private readonly pages = new Map<string, BrowserCdpPage>()
  private readonly artifacts = new BrowserArtifacts()

  constructor(private readonly surfaces?: {
    createAgentSurface(input: {
      sessionId: string
      profileId: string
    }): BrowserPageHost
  }) {}

  async open(session: BrowserSession, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    if (!/^browser-[a-zA-Z0-9-]+$/.test(session.profileId)) throw new Error('Invalid browser profile')
    if (this.pages.has(session.id)) throw new Error('Browser session already open')
    const window = this.surfaces?.createAgentSurface({
      sessionId: session.id,
      profileId: session.profileId
    }) ?? createBrowserWindow(session.profileId)
    const page = new BrowserCdpPage(window)
    this.pages.set(session.id, page)
    window.on('closed', () => { this.pages.delete(session.id) })
    const stop = () => { if (!window.isDestroyed()) window.destroy() }
    try {
      await boundedBrowserWork(async () => {
        await window.loadURL('about:blank')
        await page.initialize()
      }, signal, stop)
    } catch (error) { stop(); throw error }
  }

  async close(id: string): Promise<void> {
    const page = this.pages.get(id)
    this.pages.delete(id)
    if (page && !page.window.isDestroyed()) page.window.destroy()
  }

  async execute(
    session: BrowserSession, action: BrowserAction, args: JsonObject,
    signal: AbortSignal, roots: string[]
  ): Promise<JsonObject> {
    const page = this.pages.get(session.id)
    if (!page || page.window.isDestroyed()) throw new Error('Browser session is closed')
    const timeoutMs = action === 'wait_for' ? boundedTimeout(args.timeoutMs) + 1000 : 15_000
    const cancellation = new AbortController()
    const operationSignal = AbortSignal.any([signal, cancellation.signal])
    return boundedBrowserWork(
      () => this.perform(page, session, action, args, operationSignal, roots),
      signal, () => { cancellation.abort(); void this.close(session.id) }, timeoutMs
    )
  }

  private async perform(
    page: BrowserCdpPage, session: BrowserSession, action: BrowserAction,
    args: JsonObject, signal: AbortSignal, roots: string[]
  ): Promise<JsonObject> {
    if (action === 'navigate') {
      await page.window.loadURL(browserUrl(text(args, 'url')))
      signal.throwIfAborted()
      return this.snapshot(page)
    }
    if (action === 'snapshot') return this.snapshot(page)
    if (action === 'evaluate') return evaluateBrowserSnapshot(await this.snapshot(page), text(args, 'expression'), signal)
    if (action === 'wait_for') {
      const expected = text(args, 'text')
      const deadline = Date.now() + boundedTimeout(args.timeoutMs)
      do {
        signal.throwIfAborted()
        const snapshot = await this.snapshot(page)
        if (typeof snapshot.text === 'string' && snapshot.text.includes(expected)) return { ...snapshot, matched: true }
        if (Date.now() >= deadline) break
        await delay(Math.min(100, Math.max(1, deadline - Date.now())), undefined, { signal })
      } while (Date.now() <= deadline)
      throw new Error('Browser wait timed out')
    }
    if (action === 'screenshot' || action === 'download') {
      const path = text(args, 'path')
      await new ScopePathResolver().resolve({ path, roots, operation: 'write' })
      signal.throwIfAborted()
      const bytes = action === 'screenshot' ? await this.capture(page) : await this.download(page, text(args, 'url'), signal)
      signal.throwIfAborted()
      return this.artifacts.save(path, bytes, roots, {
        sessionId: session.id, executionId: session.executionId,
        sourceUrl: action === 'download' ? text(args, 'url') : page.window.webContents.getURL()
      }, signal)
    }
    const ref = text(args, 'ref')
    if (action === 'upload') {
      const path = await this.artifacts.upload(text(args, 'path'), roots)
      signal.throwIfAborted()
      await page.upload(ref, path)
    } else if (action === 'click') {
      await page.click(ref)
    } else if (action === 'press') {
      await page.press(ref, text(args, 'key'))
    } else if (action === 'fill' || action === 'select') {
      const value = text(args, 'value', true)
      await page.evaluate(`globalThis.__realmflowBrowser.${action}(${JSON.stringify(ref)}, ${JSON.stringify(value)})`)
    } else { throw new Error('Unsupported browser action') }
    return { completed: true, action, sessionId: session.id }
  }

  private async snapshot(page: BrowserCdpPage): Promise<JsonObject> {
    return { ...await page.snapshot(), url: publicBrowserUrl(page.window.webContents.getURL()) }
  }

  private async capture(page: BrowserCdpPage): Promise<Buffer> {
    await page.evaluate('globalThis.__realmflowBrowser.mask()')
    try {
      const result = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
      return Buffer.from(result.data, 'base64')
    } finally { await page.evaluate('globalThis.__realmflowBrowser.unmask()') }
  }

  private async download(page: BrowserCdpPage, url: string, signal: AbortSignal): Promise<Buffer> {
    const response = await page.window.webContents.session.fetch(browserUrl(url), {
      signal, redirect: 'error'
    })
    if (!response.ok || !response.body) throw new Error(`Browser download failed (${response.status})`)
    const reader = response.body.getReader()
    const chunks: Buffer[] = []
    let size = 0
    try {
      while (true) {
        signal.throwIfAborted()
        const chunk = await reader.read()
        if (chunk.done) break
        size += chunk.value.byteLength
        if (size > MAX_BROWSER_ARTIFACT_BYTES) throw new Error('Browser download exceeds size limit')
        chunks.push(Buffer.from(chunk.value))
      }
    } finally { await reader.cancel().catch(() => {}) }
    return Buffer.concat(chunks)
  }
}

function text(args: JsonObject, key: string, allowEmpty = false): string {
  const value = args[key]
  if (typeof value !== 'string' || (!allowEmpty && !value) || value.length > 16_000) {
    throw new Error(`Invalid browser ${key}`)
  }
  return value
}

function boundedTimeout(value: unknown): number {
  if (value === undefined) return 10_000
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 30_000) {
    throw new Error('Browser timeout must be 1–30000 milliseconds')
  }
  return value
}
