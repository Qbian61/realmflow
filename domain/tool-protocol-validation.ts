export type JsonObject = Record<string, unknown>

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const DIGEST_PATTERN = /^[a-f0-9]{64}$/

export function cloneJsonObject(value: unknown, field: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${field} is invalid`)
  }
  try {
    const cloned = JSON.parse(JSON.stringify(value)) as unknown
    if (!cloned || typeof cloned !== 'object' || Array.isArray(cloned)) {
      throw new Error()
    }
    return cloned as JsonObject
  } catch {
    throw new Error(`${field} is not JSON serializable`)
  }
}

export function normalizeIdentifiers(value: unknown, field: string): string[] {
  return normalizeStringArray(value, field).map((identifier) => {
    if (!IDENTIFIER_PATTERN.test(identifier)) {
      throw new Error(`${field} are invalid`)
    }
    return identifier
  })
}

export function normalizeStringArray(
  value: unknown,
  field: string,
  options: {
    sorted?: boolean
    deduplicate?: boolean
  } = {}
): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${field} are invalid`)
  }
  const normalized = value.map((item) => requireText(item, field))
  const unique = [...new Set(normalized)]
  if (
    options.deduplicate !== true &&
    unique.length !== normalized.length
  ) {
    throw new Error(`${field} are duplicated`)
  }
  return options.sorted === false ? unique : unique.sort()
}

export function requireObject(
  value: unknown,
  field: string
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${field} is invalid`)
  }
  return value as Record<string, unknown>
}

export function requireExactKeys(
  value: Record<string, unknown>,
  allowed: Set<string>,
  field: string,
  optional: Set<string> = new Set()
): void {
  if (
    Object.keys(value).some((key) => !allowed.has(key)) ||
    [...allowed].some((key) => !optional.has(key) && !(key in value))
  ) {
    throw new Error(`${field} fields are invalid`)
  }
}

export function requireIdentifier(value: unknown, field: string): string {
  const normalized = requireText(value, field)
  if (!IDENTIFIER_PATTERN.test(normalized)) {
    throw new Error(`${field} is invalid`)
  }
  return normalized
}

export function requireSemver(value: unknown, field: string): string {
  const normalized = requireText(value, field)
  if (!SEMVER_PATTERN.test(normalized)) {
    throw new Error(`${field} is invalid`)
  }
  return normalized
}

export function requireDigest(value: unknown, field: string): string {
  const normalized = requireText(value, field).toLowerCase()
  if (!DIGEST_PATTERN.test(normalized)) {
    throw new Error(`${field} is invalid`)
  }
  return normalized
}

export function requireSafeRelativePath(
  value: unknown,
  field: string
): string {
  const normalized = requireText(value, field).replaceAll('\\', '/')
  const parts = normalized.split('/')
  if (
    normalized.startsWith('/') ||
    /^[A-Za-z]:\//.test(normalized) ||
    parts.some((part) => !part || part === '.' || part === '..')
  ) {
    throw new Error(`${field} is invalid`)
  }
  return normalized
}

export function requireText(
  value: unknown,
  field: string,
  allowEmpty = false
): string {
  if (typeof value !== 'string') {
    throw new Error(`${field} is invalid`)
  }
  const normalized = value.trim()
  if ((!allowEmpty && !normalized) || normalized.includes('\0')) {
    throw new Error(`${field} is invalid`)
  }
  return normalized
}

export function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${field} is invalid`)
  }
  return value
}

export function requireInteger(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  ) {
    throw new Error(`${field} is invalid`)
  }
  return value as number
}

export function requireEnum<T extends string>(
  value: unknown,
  allowed: Set<T>,
  field: string
): T {
  if (typeof value !== 'string' || !allowed.has(value as T)) {
    throw new Error(`${field} is invalid`)
  }
  return value as T
}
