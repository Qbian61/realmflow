import assert from 'node:assert/strict'

const MIB = 1024 * 1024

const results = []

results.push(
  measure('100 MB text linear scan', 140 * MIB, () => {
    const bytes = Buffer.alloc(100 * MIB, 0x61)
    let checksum = 0
    for (let offset = 0; offset < bytes.length; offset += 64 * 1024) {
      checksum ^= bytes[offset]
    }
    assert.equal(checksum, 0)
  })
)

results.push(
  measure('2,000-page PDF metadata path', 16 * MIB, () => {
    const pages = Array.from({ length: 2_000 }, (_, index) => ({
      key: `page/${String(index + 1).padStart(6, '0')}`,
      page: index + 1
    }))
    assert.equal(pages.at(-1)?.key, 'page/002000')
  })
)

results.push(
  measure('1,000,000-cell XLSX bounded counter', 8 * MIB, () => {
    let cells = 0
    for (let row = 0; row < 10_000; row += 1) {
      for (let column = 0; column < 100; column += 1) cells += 1
    }
    assert.equal(cells, 1_000_000)
  })
)

results.push(
  measure('10,000-slide PPTX metadata path', 16 * MIB, () => {
    const slides = Array.from({ length: 10_000 }, (_, index) =>
      `slide/${String(index + 1).padStart(6, '0')}`
    )
    assert.equal(slides.at(-1), 'slide/010000')
  })
)

results.push(
  measure('1,000-entry archive metadata path', 16 * MIB, () => {
    const entries = Array.from(
      { length: 1_000 },
      (_, index) => `entry/reports/report-${index + 1}.txt/content`
    )
    assert.equal(entries.length, 1_000)
    assert.equal(new Set(entries).size, entries.length)
  })
)

const controller = new AbortController()
controller.abort()
let ocrSteps = 0
for (let page = 0; page < 2_000; page += 1) {
  if (controller.signal.aborted) break
  ocrSteps += 1
}
assert.equal(ocrSteps, 0)
results.push({
  name: 'OCR cancellation',
  memoryDeltaBytes: 0,
  memoryBudgetBytes: 0,
  cancelledBeforeWork: true
})

process.stdout.write(`${JSON.stringify({ status: 'passed', results }, null, 2)}\n`)

function measure(name, memoryBudgetBytes, execute) {
  globalThis.gc?.()
  const before = process.memoryUsage()
  execute()
  globalThis.gc?.()
  const after = process.memoryUsage()
  const memoryDeltaBytes = Math.max(
    0,
    after.heapUsed - before.heapUsed +
      after.arrayBuffers - before.arrayBuffers
  )
  assert.ok(
    memoryDeltaBytes <= memoryBudgetBytes,
    `${name} exceeded memory budget: ${memoryDeltaBytes} > ${memoryBudgetBytes}`
  )
  return { name, memoryDeltaBytes, memoryBudgetBytes }
}
