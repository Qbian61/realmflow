import { describe, expect, it, vi } from 'vitest'
import { ElectronMacOsComputerDriver } from './electron-macos-computer-driver'

describe('ElectronMacOsComputerDriver', () => {
  it('escapes text and bundle IDs before passing a fixed script to osascript', async () => {
    const runAppleScript = vi
      .fn()
      .mockResolvedValue('com.example.Editor\tAXTextField\tBody')
    const driver = createDriver(runAppleScript)

    await driver.control({
      action: 'type',
      bundleId: 'com.example.Editor',
      arguments: {
        bundleId: 'com.example.Editor',
        text: 'hello "quoted"\\line'
      },
      signal: new AbortController().signal
    })

    expect(runAppleScript).toHaveBeenCalledWith(
      expect.stringContaining('hello \\"quoted\\"\\\\line'),
      expect.any(AbortSignal)
    )
  })

  it('rejects unsupported key chords before invoking osascript', async () => {
    const runAppleScript = vi.fn()
    const driver = createDriver(runAppleScript)

    await expect(
      driver.control({
        action: 'key',
        bundleId: 'com.example.Editor',
        arguments: {
          bundleId: 'com.example.Editor',
          key: 'F19',
          modifiers: []
        },
        signal: new AbortController().signal
      })
    ).rejects.toThrow('Computer Use key is invalid')
    expect(runAppleScript).not.toHaveBeenCalled()
  })

  it('never returns focused values from secure text fields', async () => {
    const driver = createDriver(
      vi.fn().mockResolvedValue(
        'com.example.Editor\tAXSecureTextField\tPassword'
      )
    )

    await expect(
      driver.observe(
        'com.example.Editor',
        new AbortController().signal
      )
    ).resolves.toEqual({
      application: 'com.example.Editor',
      elements: [
        {
          role: 'AXSecureTextField',
          title: '[secure]',
          secure: true
        }
      ]
    })
  })
})

function createDriver(runAppleScript: ReturnType<typeof vi.fn>) {
  return new ElectronMacOsComputerDriver({
    runAppleScript,
    getScreenSources: vi.fn().mockResolvedValue([
      {
        id: 'screen:1',
        name: 'Display',
        thumbnail: {
          isEmpty: () => false,
          getSize: () => ({ width: 800, height: 600 }),
          toPNG: () => Buffer.from([1, 2, 3])
        }
      }
    ]),
    now: () => 0
  })
}
