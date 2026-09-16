import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { NativeWorkbenchMenu } from './features/workbench/NativeWorkbenchMenu'
import { createRendererRepositories } from './infrastructure/storage/renderer-repositories'
import './styles.css'

const nativeOverlay = new URLSearchParams(window.location.search).get(
  'nativeOverlay'
)

if (nativeOverlay) {
  document.documentElement.classList.add('native-overlay-root')
  document.body.classList.add('native-overlay-body')
}

async function renderApplication(): Promise<void> {
  const repositories =
    nativeOverlay === 'workbench-menu'
      ? undefined
      : await createRendererRepositories()

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      {nativeOverlay === 'workbench-menu' ? (
        <NativeWorkbenchMenu
          onAction={(action) => {
            window.nativeOverlayMenu?.select(action)
          }}
          onClose={() => {
            window.nativeOverlayMenu?.close()
          }}
        />
      ) : (
        <App repositories={repositories} />
      )}
    </React.StrictMode>
  )
}

void renderApplication()
