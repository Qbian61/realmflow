#!/usr/bin/env node

import Ajv2020 from 'ajv/dist/2020.js'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  sha256Json,
  validateGoldenSet,
  validateResult
} from './knowledge-benchmark-core.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const resultPath = resolve(
  process.argv[2] ??
    join(root, 'benchmarks', 'knowledge-search', 'latest.json')
)
const goldenPath = join(root, 'fixtures', 'knowledge-search-golden.json')
const schemaPath = join(
  root,
  'fixtures',
  'knowledge-search-result.schema.json'
)

async function main() {
  const [goldenRaw, resultRaw, schemaRaw] = await Promise.all([
    readFile(goldenPath, 'utf8'),
    readFile(resultPath, 'utf8'),
    readFile(schemaPath, 'utf8')
  ])
  const golden = validateGoldenSet(JSON.parse(goldenRaw))
  const result = validateResult(JSON.parse(resultRaw))
  const schema = JSON.parse(schemaRaw)
  const ajv = new Ajv2020({ strict: true, allErrors: true })
  ajv.addFormat('date-time', {
    type: 'string',
    validate: (value) =>
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString() === value
  })
  const validate = ajv.compile(schema)
  if (!validate(result)) {
    throw new Error(
      `Benchmark result JSON schema failed: ${ajv.errorsText(validate.errors)}`
    )
  }
  if (result.seed !== golden.seed) {
    throw new Error('Benchmark result seed does not match the golden set')
  }
  if (result.goldenSetSha256 !== sha256Json(golden)) {
    throw new Error('Benchmark result golden-set digest is stale')
  }
  process.stdout.write(
    `Verified knowledge benchmark result (${result.status}): ${resultPath}\n`
  )
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`
  )
  process.exitCode = 1
})
