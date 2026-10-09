import { execFile } from 'node:child_process'
import {
  desktopCapturer,
  systemPreferences
} from 'electron'
import { ElectronMacOsComputerDriver } from './electron-macos-computer-driver'
import { MacOsNativeComputerHost } from './macos-native-computer-host'

export function createElectronMacOsComputerHost(): MacOsNativeComputerHost {
  return new MacOsNativeComputerHost({
    permissions: {
      screenRecording: () =>
        systemPreferences.getMediaAccessStatus('screen') === 'granted',
      accessibility: () =>
        systemPreferences.isTrustedAccessibilityClient(false)
    },
    driver: new ElectronMacOsComputerDriver({
      runAppleScript,
      getScreenSources: () =>
        desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: { width: 1920, height: 1080 },
          fetchWindowIcons: false
        })
    })
  })
}

function runAppleScript(
  script: string,
  signal: AbortSignal
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      '/usr/bin/osascript',
      ['-e', script],
      {
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
        timeout: 30_000,
        signal
      },
      (error, stdout) => {
        if (error) {
          reject(new Error('Computer Use native action failed'))
          return
        }
        resolve(stdout)
      }
    )
  })
}
