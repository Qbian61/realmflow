import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { TooltipProvider } from './features/tooltip/TooltipProvider'
import { NativeWorkbenchMenu } from './features/workbench/NativeWorkbenchMenu'
import { LocalizationProvider } from './localization/LocalizationProvider'
import { ThemeProvider } from './theme/ThemeProvider'
import './styles.css'
import './components/ui/ui.css'

const nativeOverlay = new URLSearchParams(window.location.search).get(
  'nativeOverlay'
)

if (nativeOverlay) {
  document.documentElement.classList.add('native-overlay-root')
  document.body.classList.add('native-overlay-body')
}

async function renderApplication(): Promise<void> {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      {nativeOverlay === 'workbench-menu' ? (
        <ThemeProvider>
          <LocalizationProvider>
            <TooltipProvider>
              <NativeWorkbenchMenu
                onAction={(action) => {
                  window.nativeOverlayMenu?.select(action)
                }}
                onClose={() => {
                  window.nativeOverlayMenu?.close()
                }}
              />
            </TooltipProvider>
          </LocalizationProvider>
        </ThemeProvider>
      ) : (
        <App degraded={!window.realmflow?.business} />
      )}
    </React.StrictMode>
  )
}

void renderApplication()
