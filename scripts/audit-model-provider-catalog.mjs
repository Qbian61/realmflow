import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import ts from 'typescript'

const publicCatalogs = {
  huggingface: 'https://router.huggingface.co/v1/models',
  openrouter: 'https://openrouter.ai/api/v1/models',
  nvidia: 'https://integrate.api.nvidia.com/v1/models'
}

function argumentValue(name) {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}

async function loadGeneratedCatalog() {
  const source = await readFile(
    new URL('../domain/model-provider-catalog-data.ts', import.meta.url),
    'utf8'
  )
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext }
  }).outputText
  const module = await import(
    `data:text/javascript;base64,${Buffer.from(transpiled).toString('base64')}`
  )
  return module.MODEL_PROVIDER_CATALOG_SEEDS
}

async function loadCatalog() {
  const fixturePath = argumentValue('--catalog')
  if (fixturePath) {
    return JSON.parse(await readFile(fixturePath, 'utf8'))
  }
  return loadGeneratedCatalog()
}

async function loadOfficialCatalog(providerId) {
  const fixtureDirectory = argumentValue('--official-dir')
  if (fixtureDirectory) {
    return JSON.parse(
      await readFile(join(fixtureDirectory, `${providerId}.json`), 'utf8')
    )
  }

  const response = await fetch(publicCatalogs[providerId], {
    signal: AbortSignal.timeout(30000)
  })
  if (!response.ok) {
    throw new Error(
      `${providerId} catalog request failed: ${response.status} ${response.statusText}`
    )
  }
  return response.json()
}

function normalizedInputTypes(inputTypes) {
  return [...new Set(inputTypes ?? [])]
    .filter((inputType) => inputType === 'text' || inputType === 'image')
    .sort()
}

function officialModels(providerId, payload) {
  const rows = Array.isArray(payload) ? payload : payload.data
  if (!Array.isArray(rows)) {
    throw new Error(`${providerId} official response does not contain models`)
  }

  return new Map(
    rows.map((model) => {
      if (providerId === 'huggingface') {
        const liveContextWindows = (model.providers ?? [])
          .filter(({ status }) => status === 'live')
          .map(({ context_length: contextWindow }) => contextWindow)
          .filter(Number.isFinite)
        return [
          model.id,
          {
            contextWindow:
              liveContextWindows.length === 0
                ? undefined
                : Math.max(...liveContextWindows),
            inputTypes: normalizedInputTypes(
              model.architecture?.input_modalities
            )
          }
        ]
      }

      if (providerId === 'openrouter') {
        return [
          model.id,
          {
            contextWindow: model.context_length,
            maxOutputTokens: model.top_provider?.max_completion_tokens,
            inputTypes: normalizedInputTypes(
              model.architecture?.input_modalities
            )
          }
        ]
      }

      return [model.id, {}]
    })
  )
}

function auditProvider(definition, officialPayload) {
  const official = officialModels(definition.id, officialPayload)
  const issues = []

  for (const model of definition.models) {
    const expected = official.get(model.id)
    const prefix = `${definition.id}/${model.id}`
    if (!expected) {
      issues.push(`${prefix}: model is not exposed by the official API`)
      continue
    }

    if (
      Number.isFinite(expected.contextWindow) &&
      expected.contextWindow !== model.contextWindow
    ) {
      issues.push(
        `${prefix}: contextWindow expected ${expected.contextWindow}, catalog has ${model.contextWindow}`
      )
    }

    const expectedInputTypes = normalizedInputTypes(expected.inputTypes)
    const catalogInputTypes = normalizedInputTypes(model.inputTypes)
    if (
      expectedInputTypes.length > 0 &&
      expectedInputTypes.join(',') !== catalogInputTypes.join(',')
    ) {
      issues.push(
        `${prefix}: inputTypes expected ${expectedInputTypes.join(',')}, catalog has ${catalogInputTypes.join(',')}`
      )
    }

    if (
      Number.isFinite(expected.maxOutputTokens) &&
      expected.maxOutputTokens !== model.maxOutputTokens
    ) {
      issues.push(
        `${prefix}: maxOutputTokens expected ${expected.maxOutputTokens}, catalog has ${model.maxOutputTokens}`
      )
    }
  }

  return issues
}

const catalog = await loadCatalog()
const auditedProviders = Object.keys(publicCatalogs)
const officialPayloads = Object.fromEntries(
  await Promise.all(
    auditedProviders.map(async (providerId) => [
      providerId,
      await loadOfficialCatalog(providerId)
    ])
  )
)
const definitions = auditedProviders.map((providerId) => {
  const definition = catalog.find(({ id }) => id === providerId)
  if (!definition) {
    throw new Error(`Catalog provider is missing: ${providerId}`)
  }
  return definition
})
const issues = definitions.flatMap((definition) =>
  auditProvider(definition, officialPayloads[definition.id])
)

if (issues.length > 0) {
  console.error(issues.join('\n'))
  process.exitCode = 1
} else {
  const verifiedModelCount = definitions.reduce(
    (count, definition) => count + definition.models.length,
    0
  )
  console.log(
    `${verifiedModelCount} models verified across ${definitions.length} public provider APIs`
  )
}
