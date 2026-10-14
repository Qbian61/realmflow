import { readdir, readFile } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv from 'ajv'

const SCOPE_ROOT_CURRENT_ROOT_GUIDANCE =
  'Omit or pass "." to use the current authorized root'
const PATH_FIELD_NAMES = new Set([
  'path',
  'paths',
  'sourcePath',
  'targetPath',
  'outputPath',
  'cwd'
])

export function compareBuiltinHandlerContracts(definitions, handlers) {
  const handlerByKey = new Map(
    handlers.map((handler) => [
      `${handler.name}@${handler.version}`,
      handler
    ])
  )
  const definitionByKey = new Map(
    definitions.map((definition) => [definition.handlerKey, definition])
  )
  const diagnostics = []

  for (const definition of [...definitions].sort((left, right) =>
    left.handlerKey.localeCompare(right.handlerKey)
  )) {
    if (!handlerByKey.has(definition.handlerKey)) {
      diagnostics.push({
        code: 'builtin_handler_unregistered',
        file: definition.file,
        message: `${definition.id} references missing handler ${definition.handlerKey}`
      })
    }
  }

  for (const handler of [...handlers].sort((left, right) =>
    `${left.name}@${left.version}`.localeCompare(
      `${right.name}@${right.version}`
    )
  )) {
    const key = `${handler.name}@${handler.version}`
    if (!definitionByKey.has(key)) {
      diagnostics.push({
        code: 'builtin_handler_without_definition',
        file: handler.file,
        message: `${key} has no builtin Tool definition`
      })
    }
  }

  return diagnostics
}

export function validateModelInputSchema(schema, file, options = {}) {
  const diagnostics = []
  if (!isRecord(schema)) {
    return [
      {
        code: 'input_schema_invalid',
        file,
        message: '#/inputSchema must be an object'
      }
    ]
  }
  if (schema.type !== 'object') {
    diagnostics.push({
      code: 'input_schema_type_invalid',
      file,
      message: '#/inputSchema.type must be object'
    })
  }
  if (schema.additionalProperties !== false) {
    diagnostics.push({
      code: 'input_schema_additional_properties',
      file,
      message: '#/inputSchema.additionalProperties must be false'
    })
  }
  validateRequired(schema, '#/inputSchema', file, diagnostics)
  validatePropertyDescriptions(schema, '#/inputSchema', file, diagnostics)
  if (options.requireExamples) {
    validateSchemaExamples(schema, '#/inputSchema', file, diagnostics)
  }
  if (options.requireTopLevelPropertyExamples) {
    validateTopLevelPropertyExamples(schema, '#/inputSchema', file, diagnostics)
  }
  return diagnostics
}

async function run() {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
  const definitions = await readBuiltinDefinitions(root)
  const handlers = await readRegisteredHandlers(root)
  const diagnostics = [
    ...definitions.flatMap(({ inputSchema, file }) =>
      validateModelInputSchema(inputSchema, file, {
        requireExamples: true,
        requireTopLevelPropertyExamples: true
      })
    ),
    ...compareBuiltinHandlerContracts(definitions, handlers)
  ]

  if (diagnostics.length > 0) {
    throw new Error(
      [
        'Tool contract verification failed.',
        ...diagnostics.map(
          ({ code, file, message }) => `- ${code}: ${file}: ${message}`
        )
      ].join('\n')
    )
  }

  console.log(
    `Verified ${definitions.length} builtin Tool contracts and ${handlers.length} registered handlers.`
  )
}

async function readBuiltinDefinitions(root) {
  const builtinRoot = resolve(root, 'resources/extensions/builtin')
  const files = await listFiles(builtinRoot)
  const definitions = []
  for (const file of files.filter(
    (path) => path.includes('/tools/') && path.endsWith('.json')
  )) {
    const content = await readFile(resolve(builtinRoot, ...file.split('/')), 'utf8')
    const definition = JSON.parse(content)
    if (definition?.executor?.kind !== 'builtin') continue
    definitions.push({
      id: definition.id,
      file: `resources/extensions/builtin/${file}`,
      handlerKey: `${definition.executor.handler}@${definition.executor.handlerVersion}`,
      inputSchema: definition.inputSchema
    })
  }
  return definitions.sort((left, right) => left.file.localeCompare(right.file))
}

async function readRegisteredHandlers(root) {
  const toolsRoot = resolve(root, 'electron/src/application/tools')
  const files = (await listFiles(toolsRoot)).filter((path) =>
    /^builtin-.*-tool-handlers\.ts$/.test(path)
  )
  const handlers = []
  for (const file of files) {
    const content = await readFile(resolve(toolsRoot, file), 'utf8')
    handlers.push(
      ...extractHandlerNames(content).map(({ name, version }) => ({
        name,
        version,
        file: `electron/src/application/tools/${file}`
      }))
    )
  }
  handlers.push(...(await readApplicationHandlers(root)))
  return uniqueHandlers(handlers)
}

async function readApplicationHandlers(root) {
  const file = 'electron/src/application/tools/builtin-tool-runtime.ts'
  const content = await readFile(resolve(root, file), 'utf8')
  return parseStringArray(content, 'APPLICATION_TOOL_HANDLER_NAMES').map(
    (name) => ({
      name,
      version: '1.0.0',
      file
    })
  )
}

function extractHandlerNames(content) {
  const version = content.match(/const\s+VERSION\s*=\s*'([^']+)'/)?.[1] ?? '1.0.0'
  const names = new Set()

  for (const match of content.matchAll(
    /name:\s*['"]([a-z][a-z0-9_.]+\.[a-z0-9_]+)['"]/g
  )) {
    names.add(match[1])
  }
  for (const match of content.matchAll(
    /['"]([a-z][a-z0-9_.]+\.[a-z0-9_]+)['"]\s*:/g
  )) {
    names.add(match[1])
  }
  for (const match of content.matchAll(
    /([A-Z_]+)\.map\(\((\w+)\)\s*=>\s*\(\{[\s\S]*?name:\s*`([a-z][a-z0-9_.]*)\.\$\{\2\}`/g
  )) {
    const values = parseStringArray(content, match[1])
    for (const value of values) {
      names.add(`${match[3]}.${value}`)
    }
  }

  if (content.includes('createBrowserToolHandlers')) {
    for (const action of [
      'create',
      'attach',
      'close',
      ...parseStringArray(content, 'ACTIONS')
    ]) {
      names.add(`browser.${action}`)
    }
  }

  return [...names].sort().map((name) => ({ name, version }))
}

function parseStringArray(content, name) {
  const match = content.match(
    new RegExp(`const\\s+${name}\\b[\\s\\S]*?=\\s*\\[([\\s\\S]*?)\\]`)
  )
  if (!match) return []
  return [...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1])
}

function validateRequired(schema, path, file, diagnostics) {
  if (schema.required === undefined) return
  if (!Array.isArray(schema.required)) {
    diagnostics.push({
      code: 'input_required_invalid',
      file,
      message: `${path}/required must be an array`
    })
    return
  }
  const properties = isRecord(schema.properties) ? schema.properties : {}
  for (const name of schema.required) {
    if (typeof name !== 'string' || !Object.hasOwn(properties, name)) {
      diagnostics.push({
        code: 'input_required_unknown',
        file,
        message: `${path}/required/${String(name)} must reference a property`
      })
    }
  }
}

function validatePropertyDescriptions(schema, path, file, diagnostics) {
  if (isRecord(schema.properties)) {
    for (const [name, property] of Object.entries(schema.properties)) {
      const propertyPath = `${path}/properties/${name}`
      if (!isRecord(property)) {
        diagnostics.push({
          code: 'input_property_invalid',
          file,
          message: `${propertyPath} must be an object`
        })
        continue
      }
      if (
        typeof property.description !== 'string' ||
        property.description.trim() === ''
      ) {
        diagnostics.push({
          code: 'input_property_description_missing',
          file,
          message: `${propertyPath}.description is required`
        })
      } else {
        validateNonPlaceholderDescription(
          name,
          property.description.trim(),
          propertyPath,
          file,
          diagnostics
        )
        validateHighRiskFieldDescription(
          name,
          property,
          property.description.trim(),
          propertyPath,
          file,
          diagnostics
        )
      }
      validateRequired(property, propertyPath, file, diagnostics)
      validatePropertyDescriptions(property, propertyPath, file, diagnostics)
    }
  }
  if (isRecord(schema.items)) {
    validatePropertyDescriptions(schema.items, `${path}/items`, file, diagnostics)
  }
  for (const key of ['oneOf', 'anyOf', 'allOf']) {
    if (Array.isArray(schema[key])) {
      schema[key].forEach((item, index) => {
        if (isRecord(item)) {
          validatePropertyDescriptions(item, `${path}/${key}/${index}`, file, diagnostics)
        }
      })
    }
  }
}

function validateSchemaExamples(schema, path, file, diagnostics) {
  const examples = Array.isArray(schema.examples) ? schema.examples : []
  if (examples.length === 0) {
    diagnostics.push({
      code: 'input_examples_missing',
      file,
      message: `${path}.examples is required`
    })
    return
  }

  const validate = compileJsonSchema(schema, path, file, diagnostics)
  if (!validate) return
  examples.forEach((example, index) => {
    if (!validate(example)) {
      diagnostics.push({
        code: 'input_examples_invalid',
        file,
        message: `${path}/examples/${index} must validate against the input schema`
      })
    }
  })
}

function validateTopLevelPropertyExamples(schema, path, file, diagnostics) {
  const rootExamples = Array.isArray(schema.examples) ? schema.examples : []
  if (!isRecord(schema.properties)) return
  for (const [name, property] of Object.entries(schema.properties)) {
    if (!isRecord(property)) continue
    const propertyPath = `${path}/properties/${name}`
    const validate = compileJsonSchema(property, propertyPath, file, diagnostics)
    if (!validate) continue
    const propertyExamples = Array.isArray(property.examples)
      ? property.examples
      : []
    let hasValidExample = false
    propertyExamples.forEach((example, index) => {
      if (!validate(example)) {
        diagnostics.push({
          code: 'input_property_examples_invalid',
          file,
          message:
            `${propertyPath}/examples/${index} must validate against the property schema`
        })
        return
      }
      hasValidExample = true
    })
    if (
      !hasValidExample &&
      rootExamples.some(
        (example) =>
          isRecord(example) &&
          Object.hasOwn(example, name) &&
          validate(example[name])
      )
    ) {
      hasValidExample = true
    }
    if (!hasValidExample) {
      diagnostics.push({
        code: 'input_property_examples_missing',
        file,
        message:
          `${propertyPath}.examples is required or inputSchema.examples must cover it`
      })
    }
  }
}

function compileJsonSchema(schema, path, file, diagnostics) {
  try {
    return new Ajv({
      strict: false,
      allErrors: true,
      validateFormats: false
    }).compile(schema)
  } catch {
    diagnostics.push({
      code: 'input_schema_invalid',
      file,
      message: `${path} must compile as JSON Schema`
    })
    return null
  }
}

function validateNonPlaceholderDescription(name, description, path, file, diagnostics) {
  if (!isPlaceholderDescription(name, description)) return
  diagnostics.push({
    code: 'input_property_description_placeholder',
    file,
    message: `${path}.description must be specific and must not use placeholder wording`
  })
}

function isPlaceholderDescription(name, description) {
  const text = normalizeDescription(description)
  const field = name.toLowerCase()
  return (
    text === field ||
    text === `the ${field}` ||
    text === 'input value' ||
    text.includes(`${field} argument for builtin.`)
  )
}

function validateHighRiskFieldDescription(
  name,
  property,
  description,
  path,
  file,
  diagnostics
) {
  if (name === 'sourceKinds' && enumValues(property).includes('repository')) {
    if (!describesRepositorySourceKinds(description)) {
      diagnostics.push({
        code: 'input_source_kinds_repository_semantics',
        file,
        message:
          `${path}.description must say repository means code repositories and code is not a valid sourceKind`
      })
    }
  }

  if (
    name === 'scopeRoot' &&
    !description.includes(SCOPE_ROOT_CURRENT_ROOT_GUIDANCE)
  ) {
    diagnostics.push({
      code: 'input_scope_root_current_authorized_root_guidance',
      file,
      message:
        `${path}.description must include: ${SCOPE_ROOT_CURRENT_ROOT_GUIDANCE}`
    })
  }

  if (
    PATH_FIELD_NAMES.has(name) &&
    !describesAuthorizedRelativePath(description)
  ) {
    diagnostics.push({
      code: 'input_path_authorized_relative_guidance',
      file,
      message:
        `${path}.description must say to use a relative path under the authorized root and not invent absolute local paths`
    })
  }

  if (isRevisionField(name) && !describesTrustedRevisionSource(description)) {
    diagnostics.push({
      code: 'input_revision_trusted_source_guidance',
      file,
      message:
        `${path}.description must say to copy the value from the latest RealmFlow UI/API state and not invent it`
    })
  }

  if (
    name === 'idempotencyKey' &&
    !describesIdempotencyKeyReuse(description)
  ) {
    diagnostics.push({
      code: 'input_idempotency_key_reuse_guidance',
      file,
      message:
        `${path}.description must say to reuse the same key for retries of the same user request and use a new key for a different user intent`
    })
  }
}

function describesRepositorySourceKinds(description) {
  const text = normalizeDescription(description)
  return (
    text.includes('repository') &&
    text.includes('code repository') &&
    (
      text.includes('code is not a valid sourcekind') ||
      text.includes('"code" is not a valid sourcekind') ||
      text.includes('`code` is not a valid sourcekind') ||
      /use [`"']?repository[`"']?,? not [`"']?code/.test(text) ||
      /do not use [`"']?code/.test(text)
    )
  )
}

function describesAuthorizedRelativePath(description) {
  const text = normalizeDescription(description)
  return (
    text.includes('relative path') &&
    text.includes('authorized root') &&
    (
      /do not (?:invent|provide|use|pass) .*absolute/.test(text) ||
      text.includes('absolute local paths are rejected') ||
      text.includes('absolute paths are rejected')
    )
  )
}

function isRevisionField(name) {
  return name === 'expectedRevision' || name.endsWith('Revision')
}

function describesTrustedRevisionSource(description) {
  const text = normalizeDescription(description)
  return (
    text.includes('latest realmflow ui/api state') &&
    (
      text.includes('do not invent') ||
      text.includes('must not invent') ||
      text.includes('never invent')
    )
  )
}

function describesIdempotencyKeyReuse(description) {
  const text = normalizeDescription(description)
  return (
    text.includes('reuse the same key') &&
    text.includes('same user request') &&
    text.includes('new key') &&
    text.includes('different user intent')
  )
}

function enumValues(schema) {
  const values = []
  if (Array.isArray(schema.enum)) values.push(...schema.enum)
  if (isRecord(schema.items)) values.push(...enumValues(schema.items))
  for (const key of ['oneOf', 'anyOf', 'allOf']) {
    if (Array.isArray(schema[key])) {
      for (const item of schema[key]) {
        if (isRecord(item)) values.push(...enumValues(item))
      }
    }
  }
  return values.map(String)
}

function normalizeDescription(description) {
  return description.toLowerCase().replace(/\s+/g, ' ').trim()
}

function uniqueHandlers(handlers) {
  const byKey = new Map()
  for (const handler of handlers) {
    const key = `${handler.name}@${handler.version}`
    const existing = byKey.get(key)
    if (existing && existing.file !== handler.file) {
      throw new Error(
        `Duplicate builtin Tool handler registration: ${key}`
      )
    }
    byKey.set(key, handler)
  }
  return [...byKey.values()].sort((left, right) =>
    `${left.name}@${left.version}`.localeCompare(
      `${right.name}@${right.version}`
    )
  )
}

async function listFiles(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true })
  const paths = []
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      paths.push(...(await listFiles(path, relativePath)))
    } else if (entry.isFile()) {
      paths.push(relativePath.split(sep).join('/'))
    }
  }
  return paths.sort()
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
