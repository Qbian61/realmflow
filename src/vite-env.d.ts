/// <reference types="vite/client" />

import type { RealmFlowApi } from '../shared/types'
import type { WorkbenchActionId } from '../shared/native-overlay'

declare global {
  interface Window {
    realmflow?: RealmFlowApi
    nativeOverlayMenu?: {
      select: (action: WorkbenchActionId) => void
      close: () => void
    }
  }
}

export {}
