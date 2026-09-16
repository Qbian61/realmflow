export type WorkbenchBounds = {
  x: number
  y: number
  width: number
  height: number
}

export type WebPageState = {
  id: string
  title: string
  url: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  error?: string
}

export interface WebWorkbenchApi {
  create: (url: string) => Promise<WebPageState>
  show: (id: string, bounds: WorkbenchBounds) => Promise<void>
  hideAll: () => Promise<void>
  setBounds: (id: string, bounds: WorkbenchBounds) => Promise<void>
  navigate: (id: string, url: string) => Promise<WebPageState>
  goBack: (id: string) => Promise<void>
  goForward: (id: string) => Promise<void>
  reload: (id: string) => Promise<void>
  destroy: (id: string) => Promise<void>
  openExternal: (url: string) => Promise<void>
  onStateChange: (listener: (state: WebPageState) => void) => () => void
}
