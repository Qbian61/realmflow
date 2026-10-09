#!/usr/bin/env node

import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runKnowledgeBenchmark } from './knowledge-benchmark-runner.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function parseArguments(argv) {
  const options = {
    root,
    goldenPath: join(root, 'fixtures', 'knowledge-search-golden.json'),
    outputPath: join(root, 'benchmarks', 'knowledge-search', 'latest.json'),
    pythonPath:
      process.platform === 'win32'
        ? join(root, 'python-service', '.venv', 'Scripts', 'python.exe')
        : join(root, 'python-service', '.venv', 'bin', 'python'),
    qdrantPath: defaultQdrantPath(root),
    sizes: [1_000, 10_000, 100_000],
    probeOnly: false,
    keepTemporary: false
  }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--output') {
      options.outputPath = resolve(requiredValue(argv, ++index, argument))
    } else if (argument === '--golden') {
      options.goldenPath = resolve(requiredValue(argv, ++index, argument))
    } else if (argument === '--python') {
      options.pythonPath = resolve(requiredValue(argv, ++index, argument))
    } else if (argument === '--qdrant') {
      options.qdrantPath = resolve(requiredValue(argv, ++index, argument))
    } else if (argument === '--sizes') {
      options.sizes = requiredValue(argv, ++index, argument)
        .split(',')
        .map((value) => Number(value))
    } else if (argument === '--probe-only') {
      options.probeOnly = true
    } else if (argument === '--keep-temporary') {
      options.keepTemporary = true
    } else {
      throw new Error(`Unknown argument: ${argument}`)
    }
  }
  if (
    options.sizes.length === 0 ||
    options.sizes.some(
      (size) => ![1_000, 10_000, 100_000].includes(size)
    ) ||
    new Set(options.sizes).size !== options.sizes.length
  ) {
    throw new Error('--sizes must be a unique subset of 1000,10000,100000')
  }
  return options
}

function requiredValue(argv, index, argument) {
  const value = argv[index]
  if (!value || value.startsWith('--')) {
    throw new Error(`${argument} requires a value`)
  }
  return value
}

function defaultQdrantPath(projectRoot) {
  const target = `${process.platform}-${process.arch}`
  const binary = process.platform === 'win32' ? 'qdrant.exe' : 'qdrant'
  return join(projectRoot, 'resources', 'qdrant', target, binary)
}

runKnowledgeBenchmark(parseArguments(process.argv.slice(2)))
  .then(({ result, outputPath }) => {
    process.stdout.write(
      `Knowledge benchmark ${result.status}: ${outputPath}\n`
    )
  })
  .catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`
    )
    process.exitCode = 1
  })
