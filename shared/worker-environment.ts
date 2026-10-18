export type WorkerEnvironmentInput = {
  baseEnv?: Record<string, string | undefined>
  overrideEnv?: Record<string, string | undefined>
  extraEnv?: Record<string, string | undefined>
  pythonPathEntries?: string[]
}

const SAFE_INHERITED_ENV_NAMES = new Set([
  'PATH',
  'PATHEXT',
  'SystemRoot',
  'WINDIR',
  'TEMP',
  'TMP',
  'TMPDIR',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'PYTHONIOENCODING',
  'PYTHONUTF8',
  'PYTHONUNBUFFERED',
  'PYTHONPATH',
  'ORT_LOG_SEVERITY_LEVEL',
  'TOKENIZERS_PARALLELISM'
])

const SENSITIVE_ENV_NAME =
  /(?:^|_)(?:api[_-]?key|key|token|secret|password|credential|authorization|cookie|session)(?:_|$)|^(?:openai|anthropic|deepseek|aws|azure|google|github|npm)_/i
const SENSITIVE_ENV_VALUE = /\b(?:sk-[A-Za-z0-9._-]+|Bearer\s+\S+|AKIA[A-Z0-9]+|eyJ[A-Za-z0-9_-]*\.)/

export function createSanitizedWorkerEnvironment(
  input: WorkerEnvironmentInput = {}
): Record<string, string> {
  const environment: Record<string, string> = {}
  copySafeInherited(environment, input.baseEnv ?? process.env)
  copySafeInherited(environment, input.overrideEnv ?? {})
  copyExplicit(environment, input.extraEnv ?? {})
  const pythonPath = sanitizedPythonPath(
    input.pythonPathEntries ?? [],
    environment.PYTHONPATH
  )
  if (pythonPath) environment.PYTHONPATH = pythonPath
  return environment
}

function copySafeInherited(
  target: Record<string, string>,
  source: Record<string, string | undefined>
): void {
  for (const [key, value] of Object.entries(source)) {
    if (!SAFE_INHERITED_ENV_NAMES.has(key)) continue
    copyIfSafe(target, key, value)
  }
}

function copyExplicit(
  target: Record<string, string>,
  source: Record<string, string | undefined>
): void {
  for (const [key, value] of Object.entries(source)) {
    copyIfSafe(target, key, value)
  }
}

function copyIfSafe(
  target: Record<string, string>,
  key: string,
  value: string | undefined
): void {
  if (value === undefined || value === '') return
  if (SENSITIVE_ENV_NAME.test(key) || SENSITIVE_ENV_VALUE.test(value)) return
  target[key] = value
}

function sanitizedPythonPath(
  entries: string[],
  inherited: string | undefined
): string | undefined {
  const separator = process.platform === 'win32' ? ';' : ':'
  return [...entries, ...(inherited ? inherited.split(separator) : [])]
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry) => !SENSITIVE_ENV_VALUE.test(entry))
    .join(separator) || undefined
}
