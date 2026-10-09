import { describe, expect, it, vi } from 'vitest'
import { MacOsNativeComputerHost } from './macos-native-computer-host'

describe('MacOsNativeComputerHost', () => {
  it('reports Screen Recording and Accessibility independently', async () => {
    const harness = createHarness()
    harness.permissions.screenRecording.mockReturnValue(false)
    harness.permissions.accessibility.mockReturnValue(true)

    await expect(harness.host.health()).resolves.toEqual({
      screenRecording: false,
      accessibility: true
    })
  })

  it('combines a sanitized accessibility observation with a PNG capture', async () => {
    const harness = createHarness()

    await expect(
      harness.host.perform({
        action: 'observe',
        bundleId: 'com.example.Editor',
        arguments: { bundleId: 'com.example.Editor' },
        signal: new AbortController().signal
      })
    ).resolves.toEqual({
      output: {
        application: 'Editor',
        elements: [{ role: 'AXButton', title: 'Save' }]
      },
      screenshot: {
        mediaType: 'image/png',
        bytes: new Uint8Array([1, 2, 3])
      }
    })
    expect(harness.driver.observe).toHaveBeenCalledWith(
      'com.example.Editor',
      expect.any(AbortSignal)
    )
  })

  it('dispatches control actions without allowing the target bundle to drift', async () => {
    const harness = createHarness()
    harness.driver.inspectTarget.mockResolvedValue({
      bundleId: 'com.other.App',
      secureInput: false
    })

    await expect(
      harness.host.perform({
        action: 'click',
        bundleId: 'com.example.Editor',
        arguments: {
          bundleId: 'com.example.Editor',
          x: 20,
          y: 30
        },
        signal: new AbortController().signal
      })
    ).rejects.toThrow('Computer Use target application changed')
    expect(harness.driver.control).not.toHaveBeenCalled()
  })
})

function createHarness() {
  const permissions = {
    screenRecording: vi.fn().mockReturnValue(true),
    accessibility: vi.fn().mockReturnValue(true)
  }
  const driver = {
    inspectTarget: vi.fn().mockResolvedValue({
      bundleId: 'com.example.Editor',
      secureInput: false
    }),
    observe: vi.fn().mockResolvedValue({
      application: 'Editor',
      elements: [{ role: 'AXButton', title: 'Save' }]
    }),
    capture: vi.fn().mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      width: 800,
      height: 600
    }),
    control: vi.fn().mockResolvedValue({ ok: true }),
    wait: vi.fn().mockResolvedValue({ matched: true })
  }
  return {
    permissions,
    driver,
    host: new MacOsNativeComputerHost({ permissions, driver })
  }
}
