import { randomUUID } from 'node:crypto'
import type { BrowserWindow } from 'electron'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import { installBrowserPage } from './browser-page-script'

export type BrowserPageHost = {
  readonly webContents: BrowserWindow['webContents']
  loadURL(url: string): Promise<void>
  isDestroyed(): boolean
  destroy(): void
  on(event: 'closed', listener: () => void): unknown
}

export class BrowserCdpPage {
  private contextId?: number
  constructor(readonly window: BrowserPageHost) {
    window.webContents.on('did-navigate', () => { this.contextId = undefined })
    window.webContents.on('did-navigate-in-page', () => { this.contextId = undefined })
  }

  async initialize(): Promise<void> {
    this.window.webContents.debugger.attach('1.3')
    await this.send('Page.enable')
  }

  send(method: string, params?: Record<string, unknown>) {
    return this.window.webContents.debugger.sendCommand(method, params)
  }

  async evaluate(expression: string, returnByValue = true) {
    const contextId = await this.world()
    const response = await this.send('Runtime.evaluate', {
      expression, contextId, returnByValue, awaitPromise: true, timeout: 5000
    })
    if (response.exceptionDetails) throw new Error('Browser page operation failed; refresh the snapshot and check the target')
    return response.result
  }

  async snapshot(): Promise<JsonObject> {
    const result = await this.evaluate(`globalThis.__realmflowBrowser.snapshot(${JSON.stringify(randomUUID())})`)
    return result.value
  }

  async click(ref: string): Promise<void> {
    const result = await this.evaluate(`(() => {
      const el = globalThis.__realmflowBrowser.target(${JSON.stringify(ref)});
      if (el.matches(':disabled')) throw new Error('Disabled target');
      el.scrollIntoView({block:'center',inline:'center'});
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) throw new Error('Invisible target');
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const top = document.elementFromPoint(x, y);
      if (!top || (top !== el && !el.contains(top))) throw new Error('Covered target');
      return { x, y };
    })()`)
    const { x, y } = result.value
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
  }

  async press(ref: string, key: string): Promise<void> {
    const keys: Record<string, number> = {
      Enter: 13, Tab: 9, Escape: 27, Backspace: 8, Delete: 46,
      ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Space: 32
    }
    if (!(key in keys)) throw new Error('Unsupported browser key')
    await this.evaluate(`globalThis.__realmflowBrowser.target(${JSON.stringify(ref)}).focus()`)
    const params = { key: key === 'Space' ? ' ' : key, code: key, windowsVirtualKeyCode: keys[key] }
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', ...params, ...(key === 'Enter' ? { text: '\r' } : {}) })
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params })
  }

  async upload(ref: string, path: string): Promise<void> {
    const object = await this.evaluate(`(() => {
      const el = globalThis.__realmflowBrowser.target(${JSON.stringify(ref)});
      if (!(el instanceof HTMLInputElement) || el.type !== 'file' || el.disabled) throw new Error('Not a file input');
      return el;
    })()`, false)
    try { await this.send('DOM.setFileInputFiles', { objectId: object.objectId, files: [path] }) }
    finally { await this.send('Runtime.releaseObject', { objectId: object.objectId }) }
  }

  private async world(): Promise<number> {
    if (this.contextId !== undefined) return this.contextId
    const tree = await this.send('Page.getFrameTree')
    const world = await this.send('Page.createIsolatedWorld', {
      frameId: tree.frameTree.frame.id, worldName: 'realmflow-browser', grantUniveralAccess: false
    })
    const contextId = world.executionContextId
    const installed = await this.send('Runtime.evaluate', {
      expression: `globalThis.__realmflowBrowser = (${installBrowserPage.toString()})(); void 0`,
      contextId, returnByValue: true, timeout: 5000
    })
    if (installed.exceptionDetails) throw new Error('Browser page runtime initialization failed')
    this.contextId = contextId
    return contextId
  }
}

export async function boundedBrowserWork<T>(
  work: () => Promise<T>, signal: AbortSignal, stop: () => void, timeoutMs = 15_000
): Promise<T> {
  signal.throwIfAborted()
  let timer: ReturnType<typeof setTimeout> | undefined
  let abort!: () => void
  const cancelled = new Promise<never>((_, reject) => {
    abort = () => { stop(); reject(new Error('Browser operation cancelled')) }
    signal.addEventListener('abort', abort, { once: true })
    timer = setTimeout(() => { stop(); reject(new Error('Browser operation timed out')) }, timeoutMs)
  })
  try {
    const result = await Promise.race([work(), cancelled])
    signal.throwIfAborted()
    return result
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', abort)
  }
}
