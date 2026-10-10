// @vitest-environment node
import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserWindow } from 'electron'
import { ElectronBrowserDriver } from './electron-browser-driver'
import type { BrowserSession } from './browser-runtime-port'

const boundary = vi.hoisted(() => ({ windows: [] as any[] }))
vi.mock('electron', () => ({
  BrowserWindow: class extends EventEmitter {
    options: any
    dead = false
    webContents: any
    constructor(options: any) {
      super()
      this.options = options
      const debuggerPort = Object.assign(new EventEmitter(), {
        attach: vi.fn(), detach: vi.fn(),
        sendCommand: vi.fn(async (method: string) => {
          if (method === 'Page.getFrameTree') return { frameTree: { frame: { id: 'main-frame' } } }
          if (method === 'Page.createIsolatedWorld') return { executionContextId: 7 }
          if (method === 'Runtime.evaluate') return { result: { value: { text: 'Local form', elements: [], trust: 'untrusted_page' } } }
          if (method === 'Page.captureScreenshot') return { data: Buffer.from('png').toString('base64') }
          return {}
        })
      })
      this.webContents = Object.assign(new EventEmitter(), {
        debugger: debuggerPort,
        setWindowOpenHandler: vi.fn(),
        getURL: () => 'https://example.test/?token=private',
        session: Object.assign(new EventEmitter(), {
          setPermissionRequestHandler: vi.fn(), setPermissionCheckHandler: vi.fn(),
          webRequest: { onBeforeRequest: vi.fn() },
          fetch: vi.fn(async () => new Response('download'))
        })
      })
      boundary.windows.push(this)
    }
    async loadURL(_url: string) {}
    isDestroyed() { return this.dead }
    destroy() { this.dead = true; this.emit('closed') }
  }
}))

const session: BrowserSession = {
  id: 'browser-one', profileId: 'browser-profile', ownerKey: 'conversation:a',
  status: 'active', revision: 1, createdAt: 1, updatedAt: 1, executionId: 'execution-one'
}
const signal = new AbortController().signal

describe('Electron browser driver', () => {
  let driver: ElectronBrowserDriver
  beforeEach(() => { boundary.windows.length = 0; driver = new ElectronBrowserDriver() })
  afterEach(async () => { await driver.close(session.id) })

  it('creates an isolated visible sandboxed browser without a preload', async () => {
    await driver.open(session, signal)
    expect(boundary.windows[0]?.options).toMatchObject({
      show: true, webPreferences: {
        partition: 'persist:realmflow-browser-browser-profile',
        sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true
      }
    })
    expect(boundary.windows[0]?.options.webPreferences.preload).toBeUndefined()
    const wc = boundary.windows[0].webContents
    expect(wc.setWindowOpenHandler.mock.calls[0][0]({ url: 'https://evil.test' })).toEqual({ action: 'deny' })
    expect(wc.session.setPermissionCheckHandler.mock.calls[0][0]()).toBe(false)
  })

  it('uses the right-workbench surface host without creating a separate window', async () => {
    const surface = new BrowserWindow({}) as never
    boundary.windows.length = 0
    const createAgentSurface = vi.fn(() => surface)
    driver = new ElectronBrowserDriver({ createAgentSurface })

    await driver.open(session, signal)

    expect(createAgentSurface).toHaveBeenCalledWith({
      sessionId: session.id,
      profileId: session.profileId
    })
    expect(boundary.windows).toHaveLength(0)
  })

  it('blocks page-driven local-file navigation and unrequested downloads', async () => {
    await driver.open(session, signal)
    const wc = boundary.windows[0]?.webContents
    expect(wc).toBeDefined()
    const event = { preventDefault: vi.fn() }
    wc.emit('will-navigate', event, 'file:///etc/passwd')
    expect(event.preventDefault).toHaveBeenCalledOnce()
    const download = { preventDefault: vi.fn() }
    wc.session.emit('will-download', download)
    expect(download.preventDefault).toHaveBeenCalledOnce()
  })

  it('rejects unsafe navigation before calling Chromium', async () => {
    await driver.open(session, signal)
    await expect(driver.execute(session, 'navigate', { url: 'file:///etc/passwd' }, signal, []))
      .rejects.toThrow('URL')
  })

  it('takes snapshots in an isolated world and sanitizes current URLs', async () => {
    await driver.open(session, signal)
    const result = await driver.execute(session, 'snapshot', {}, signal, [])
    expect(result).toMatchObject({ text: 'Local form', trust: 'untrusted_page' })
    expect(JSON.stringify(result)).not.toContain('private')
    const send = boundary.windows[0].webContents.debugger.sendCommand
    expect(send).toHaveBeenCalledWith('Page.createIsolatedWorld', expect.objectContaining({ frameId: 'main-frame' }))
    expect(send).toHaveBeenCalledWith('Runtime.evaluate', expect.objectContaining({ contextId: 7, returnByValue: true }))
  })

  it('cancels a hung Chromium operation and destroys its window', async () => {
    await driver.open(session, signal)
    const win = boundary.windows[0]
    expect(win).toBeDefined()
    win.webContents.debugger.sendCommand.mockImplementation(() => new Promise(() => {}))
    const abort = new AbortController()
    const result = driver.execute(session, 'snapshot', {}, abort.signal, [])
    const rejected = expect(result).rejects.toThrow()
    abort.abort()
    await rejected
    expect(win.dead).toBe(true)
  })

  it('refuses upload outside the scope before requesting a DOM file input', async () => {
    await driver.open(session, signal)
    await expect(driver.execute(session, 'upload', { ref: 'n1', path: '/etc/hosts' }, signal, []))
      .rejects.toThrow('scope')
  })

  it('does not continue after the user closes the browser window', async () => {
    await driver.open(session, signal)
    expect(boundary.windows[0]).toBeDefined()
    boundary.windows[0].destroy()
    await expect(driver.execute(session, 'snapshot', {}, signal, [])).rejects.toThrow('closed')
  })

  it('uses a separate network-denied sandbox for snapshot evaluation', async () => {
    await driver.open(session, signal)
    await driver.execute(session, 'evaluate', { expression: 'snapshot.elements.length' }, signal, [])
    expect(boundary.windows).toHaveLength(2)
    const evaluator = boundary.windows[1]
    expect(evaluator.options.webPreferences.partition).not.toContain('persist:')
    expect(evaluator.dead).toBe(true)
    const callback = vi.fn()
    evaluator.webContents.session.webRequest.onBeforeRequest.mock.calls[0][1](
      { url: 'https://example.test' }, callback)
    expect(callback).toHaveBeenCalledWith({ cancel: true })
    expect(evaluator.webContents.debugger.sendCommand).toHaveBeenCalledWith('Runtime.evaluate',
      expect.objectContaining({ timeout: 1000 }))
  })

  it('clicks a referenced element using Chromium input events', async () => {
    await driver.open(session, signal)
    expect(boundary.windows[0]).toBeDefined()
    const send = boundary.windows[0].webContents.debugger.sendCommand
    const original = send.getMockImplementation()!
    send.mockImplementation(async (method: string, params: any) =>
      method === 'Runtime.evaluate' && params.expression.includes('getBoundingClientRect')
        ? { result: { value: { x: 40, y: 60 } } } : original(method, params))
    await driver.execute(session, 'click', { ref: 's1:1' }, signal, [])
    expect(send).toHaveBeenCalledWith('Input.dispatchMouseEvent',
      expect.objectContaining({ type: 'mousePressed', x: 40, y: 60 }))
    expect(send).toHaveBeenCalledWith('Input.dispatchMouseEvent',
      expect.objectContaining({ type: 'mouseReleased', x: 40, y: 60 }))
  })

  it('presses a supported key on a referenced element', async () => {
    await driver.open(session, signal)
    await driver.execute(session, 'press', { ref: 's1:1', key: 'Enter' }, signal, [])
    expect(boundary.windows[0]).toBeDefined()
    expect(boundary.windows[0].webContents.debugger.sendCommand).toHaveBeenCalledWith('Input.dispatchKeyEvent',
      expect.objectContaining({ type: 'keyDown', key: 'Enter' }))
    await expect(driver.execute(session, 'press', { ref: 's1:1', key: 'INVALID' }, signal, []))
      .rejects.toThrow('key')
  })

  it('waits for page text with a bounded timeout', async () => {
    await driver.open(session, signal)
    const result = await driver.execute(session, 'wait_for', { text: 'Local form', timeoutMs: 50 }, signal, [])
    expect(result.matched).toBe(true)
    await expect(driver.execute(session, 'wait_for', { text: 'Missing', timeoutMs: 10 }, signal, []))
      .rejects.toThrow('timed out')
  })

  it('checks output scope before capturing or fetching artifact bytes', async () => {
    await driver.open(session, signal)
    for (const action of ['screenshot', 'download'] as const) {
      await expect(driver.execute(session, action, { path: '/tmp/unapproved.png', url: 'https://example.test/' }, signal, []))
        .rejects.toThrow('scope')
    }
    expect(boundary.windows[0].webContents.session.fetch).not.toHaveBeenCalled()
    expect(boundary.windows[0].webContents.debugger.sendCommand).not.toHaveBeenCalledWith('Page.captureScreenshot', expect.anything())
  })
})
