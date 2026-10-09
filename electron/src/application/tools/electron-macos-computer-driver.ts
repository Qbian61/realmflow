import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type { MacOsComputerDriver } from './macos-native-computer-host'
import type {
  ComputerActionSemantic,
  NativeComputerTarget
} from './native-computer-host'

type ScreenSource = {
  id: string
  name: string
  thumbnail: {
    isEmpty(): boolean
    getSize(): { width: number; height: number }
    toPNG(): Buffer
  }
}

type ElectronMacOsComputerDriverDependencies = {
  runAppleScript(script: string, signal: AbortSignal): Promise<string>
  getScreenSources(): Promise<ScreenSource[]>
  now?: () => number
  delay?: (milliseconds: number, signal: AbortSignal) => Promise<void>
}

const KEY_CODES = new Map([
  ['return', 36],
  ['tab', 48],
  ['space', 49],
  ['delete', 51],
  ['escape', 53],
  ['left', 123],
  ['right', 124],
  ['down', 125],
  ['up', 126]
])
const MODIFIERS = new Map([
  ['command', 'command down'],
  ['control', 'control down'],
  ['option', 'option down'],
  ['shift', 'shift down']
])

export class ElectronMacOsComputerDriver implements MacOsComputerDriver {
  private readonly now: () => number
  private readonly delay: (
    milliseconds: number,
    signal: AbortSignal
  ) => Promise<void>

  constructor(
    private readonly dependencies: ElectronMacOsComputerDriverDependencies
  ) {
    this.now = dependencies.now ?? Date.now
    this.delay = dependencies.delay ?? abortableDelay
  }

  async inspectTarget(_bundleId: string): Promise<NativeComputerTarget> {
    const output = await this.dependencies.runAppleScript(
      inspectTargetScript(),
      new AbortController().signal
    )
    const [bundleId = '', role = '', title = ''] = output.trim().split('\t')
    if (!isBundleId(bundleId)) {
      throw new Error('Computer Use active application is unavailable')
    }
    const secureInput = role === 'AXSecureTextField'
    const semantic = semanticFor(title)
    return {
      bundleId,
      secureInput,
      ...(semantic ? { actionSemantic: semantic } : {})
    }
  }

  async observe(bundleId: string, signal: AbortSignal): Promise<JsonObject> {
    const output = await this.dependencies.runAppleScript(
      inspectTargetScript(),
      signal
    )
    const [activeBundle = '', role = '', title = ''] = output.trim().split('\t')
    if (activeBundle !== bundleId) {
      throw new Error('Computer Use target application changed')
    }
    const secure = role === 'AXSecureTextField'
    return {
      application: activeBundle,
      elements: [
        {
          role: role || 'AXUnknown',
          title: secure ? '[secure]' : title,
          secure
        }
      ]
    }
  }

  async capture(
    _bundleId: string,
    signal: AbortSignal
  ): Promise<{ bytes: Uint8Array; width: number; height: number }> {
    if (signal.aborted) throw new Error('Computer Use action was cancelled')
    const sources = await this.dependencies.getScreenSources()
    const source = sources.find(({ thumbnail }) => !thumbnail.isEmpty())
    if (!source) throw new Error('Computer Use screen capture is unavailable')
    const size = source.thumbnail.getSize()
    return {
      bytes: Uint8Array.from(source.thumbnail.toPNG()),
      width: size.width,
      height: size.height
    }
  }

  async control(input: {
    action: 'focus' | 'click' | 'type' | 'key' | 'scroll'
    bundleId: string
    arguments: JsonObject
    signal: AbortSignal
  }): Promise<JsonObject> {
    if (!isBundleId(input.bundleId)) {
      throw new Error('Computer Use bundle ID is invalid')
    }
    const script = controlScript(input)
    await this.dependencies.runAppleScript(script, input.signal)
    return { ok: true, action: input.action }
  }

  async wait(input: {
    bundleId: string
    arguments: JsonObject
    signal: AbortSignal
  }): Promise<JsonObject> {
    const contains = optionalString(input.arguments.contains, 500)
    const role = optionalString(input.arguments.role, 100)
    const timeoutMs = boundedInteger(
      input.arguments.timeoutMs ?? 5_000,
      100,
      30_000,
      'wait timeout'
    )
    const deadline = this.now() + timeoutMs
    do {
      if (input.signal.aborted) {
        throw new Error('Computer Use action was cancelled')
      }
      const output = await this.dependencies.runAppleScript(
        inspectTargetScript(),
        input.signal
      )
      const [activeBundle = '', activeRole = '', title = ''] = output
        .trim()
        .split('\t')
      if (
        activeBundle === input.bundleId &&
        (!role || activeRole === role) &&
        (!contains || title.includes(contains))
      ) {
        return { matched: true, role: activeRole, title }
      }
      await this.delay(100, input.signal)
    } while (this.now() < deadline)
    return { matched: false }
  }
}

function inspectTargetScript(): string {
  return [
    'tell application "System Events"',
    'set frontProcess to first application process whose frontmost is true',
    'set activeBundle to bundle identifier of frontProcess',
    'set focusedRole to ""',
    'set focusedTitle to ""',
    'try',
    'set focusedElement to value of attribute "AXFocusedUIElement" of frontProcess',
    'set focusedRole to value of attribute "AXRole" of focusedElement',
    'if focusedRole is not "AXSecureTextField" then',
    'try',
    'set focusedTitle to value of attribute "AXTitle" of focusedElement',
    'end try',
    'end if',
    'end try',
    'return activeBundle & tab & focusedRole & tab & focusedTitle',
    'end tell'
  ].join('\n')
}

function controlScript(input: {
  action: 'focus' | 'click' | 'type' | 'key' | 'scroll'
  bundleId: string
  arguments: JsonObject
}): string {
  const bundle = appleScriptString(input.bundleId)
  if (input.action === 'focus') {
    return `tell application id "${bundle}" to activate`
  }
  if (input.action === 'click') {
    const x = boundedInteger(input.arguments.x, 0, 100_000, 'click x')
    const y = boundedInteger(input.arguments.y, 0, 100_000, 'click y')
    return `tell application "System Events" to click at {${x}, ${y}}`
  }
  if (input.action === 'type') {
    const text = requiredString(input.arguments.text, 10_000, 'text')
    return `tell application "System Events" to keystroke "${appleScriptString(text)}"`
  }
  if (input.action === 'key') {
    const key = requiredString(input.arguments.key, 20, 'key').toLowerCase()
    const code = KEY_CODES.get(key)
    if (code === undefined) throw new Error('Computer Use key is invalid')
    const modifiers = stringArray(input.arguments.modifiers, 'key modifiers')
    const mapped = modifiers.map((modifier) => {
      const value = MODIFIERS.get(modifier)
      if (!value) throw new Error('Computer Use key modifier is invalid')
      return value
    })
    const using = mapped.length ? ` using {${mapped.join(', ')}}` : ''
    return `tell application "System Events" to key code ${code}${using}`
  }
  const deltaY = boundedInteger(
    input.arguments.deltaY,
    -10,
    10,
    'scroll delta'
  )
  if (deltaY === 0) throw new Error('Computer Use scroll delta is invalid')
  const code = deltaY > 0 ? 121 : 116
  return [
    'tell application "System Events"',
    `repeat ${Math.abs(deltaY)} times`,
    `key code ${code}`,
    'end repeat',
    'end tell'
  ].join('\n')
}

function semanticFor(title: string): ComputerActionSemantic | undefined {
  const normalized = title.trim().toLowerCase()
  for (const semantic of [
    'submit',
    'send',
    'publish',
    'purchase',
    'delete'
  ] as const) {
    if (normalized.includes(semantic)) return semantic
  }
  return undefined
}

function appleScriptString(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
}

function requiredString(
  value: unknown,
  maximum: number,
  field: string
): string {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > maximum ||
    value.includes('\0')
  ) {
    throw new Error(`Computer Use ${field} is invalid`)
  }
  return value
}

function optionalString(value: unknown, maximum: number): string | undefined {
  if (value === undefined) return undefined
  return requiredString(value, maximum, 'condition')
}

function boundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  field: string
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  ) {
    throw new Error(`Computer Use ${field} is invalid`)
  }
  return value as number
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Computer Use ${field} are invalid`)
  }
  const items = value.map((item) => requiredString(item, 20, field).toLowerCase())
  if (new Set(items).size !== items.length) {
    throw new Error(`Computer Use ${field} are invalid`)
  }
  return items
}

function isBundleId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9.-]{1,199}$/.test(value)
}

function abortableDelay(
  milliseconds: number,
  signal: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(new Error('Computer Use action was cancelled'))
      },
      { once: true }
    )
  })
}
