import { randomUUID } from 'node:crypto'
import { BrowserWindow } from 'electron'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import { browserUrl } from './browser-artifacts'
import { boundedBrowserWork } from './browser-cdp-page'

export function createBrowserWindow(profileId?: string): BrowserWindow {
  const evaluator = profileId === undefined
  const window = new BrowserWindow({
    width: 1100, height: 800, show: !evaluator, title: 'RealmFlow Browser',
    webPreferences: {
      partition: evaluator ? `realmflow-evaluate-${randomUUID()}` : `persist:realmflow-browser-${profileId}`,
      sandbox: true, contextIsolation: true, nodeIntegration: false,
      webSecurity: true, webviewTag: false, spellcheck: false,
      navigateOnDragDrop: false
    }
  })
  const wc = window.webContents
  wc.setWindowOpenHandler(() => ({ action: 'deny' }))
  wc.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  wc.session.setPermissionCheckHandler(() => false)
  const preventDownload = (event: Electron.Event) => event.preventDefault()
  wc.session.on('will-download', preventDownload)
  const permitted = (url: string) => {
    if (url === 'about:blank') return true
    if (evaluator) return false
    try { browserUrl(url); return true } catch { return false }
  }
  wc.on('will-navigate', (event, url) => { if (!permitted(url)) event.preventDefault() })
  wc.on('will-redirect', (event, url) => { if (!permitted(url)) event.preventDefault() })
  wc.on('will-frame-navigate', (event) => { if (!permitted(event.url)) event.preventDefault() })
  wc.session.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    callback({ cancel: !permitted(details.url) })
  })
  window.on('closed', () => { wc.session.removeListener('will-download', preventDownload) })
  return window
}

// Expressions see a JSON snapshot in an ephemeral Chromium sandbox. They have no
// connection to the authenticated page, its partition, filesystem, or network.
export async function evaluateBrowserSnapshot(
  snapshot: JsonObject, expression: string, signal: AbortSignal
): Promise<JsonObject> {
  if (!expression || expression.length > 8000) throw new Error('Browser expression must be 1–8000 characters')
  const window = createBrowserWindow()
  const stop = () => { if (!window.isDestroyed()) window.destroy() }
  try {
    return await boundedBrowserWork(async () => {
      await window.loadURL('about:blank')
      window.webContents.debugger.attach('1.3')
      const response = await window.webContents.debugger.sendCommand('Runtime.evaluate', {
        expression: `(() => {
          const snapshot = ${JSON.stringify(snapshot)};
          const value = (${expression});
          const encoded = JSON.stringify(value);
          if (encoded === undefined) return { value: null };
          if (encoded.length > 16000) return { value: encoded.slice(0, 16000), truncated: true };
          return { value: JSON.parse(encoded), truncated: false };
        })()`,
        returnByValue: true, awaitPromise: false, timeout: 1000
      })
      if (response.exceptionDetails) throw new Error('Browser snapshot expression failed')
      return { ...response.result.value, trust: 'untrusted_page' }
    }, signal, stop, 3000)
  } finally { stop() }
}
