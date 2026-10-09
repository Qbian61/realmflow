# Knowledge Search Offline Benchmark

This benchmark uses only checked-in RealmFlow assets and local processes. It
must not download a model, start Docker, call cloud inference, or read user
content.

## Run

```bash
npm run benchmark:knowledge
npm run verify:knowledge-benchmark
```

Use `--sizes` for a bounded diagnostic run:

```bash
node scripts/benchmark-knowledge-search.mjs \
  --sizes 1000 \
  --output /tmp/realmflow-knowledge-benchmark.json
node scripts/verify-knowledge-benchmark.mjs \
  /tmp/realmflow-knowledge-benchmark.json
```

The default run indexes the same fixed-seed corpus at 1k, 10k, and 100k
visibility boundaries. Synthetic distractors use a bounded set of repeated
texts so embedding work stays bounded while Qdrant still stores and filters the
requested number of independent points.

## Measurements

- Dense, Qdrant BM25, and Qdrant native RRF: Recall@8, MRR@8, and latency.
- Fixed 1,200-character chunks with 200-character overlap versus RealmFlow's
  token-aware structured chunker.
- Verified ONNX Float32 versus INT8 when a pinned INT8 asset exists.
- Qdrant scalar INT8 versus unquantized vectors on up to 10k points.
- HNSW `(m, ef_construct)` rows `(8,64)`, `(16,100)`, `(32,200)` crossed with
  query `ef` values `32`, `64`, and `128`.
- No-op refresh manifest scan CPU, latency, disk delta, and Connector requests.
- Generation filters containing 1, 10, 100, and 1,000 current generations.

Latency-based quantization and HNSW decisions require three passes over every
golden query. A non-default decision also has to preserve Recall@8 and MRR@8
within the threshold encoded in the runner. Missing or unusable assets produce
`skipped` scenarios with an environment reason. They never produce placeholder
measurements; decisions remain Float32 and quantization disabled.

## Assets

- Golden set: `fixtures/knowledge-search-golden.json`
- Result schema: `fixtures/knowledge-search-result.schema.json`
- Latest measured result: `benchmarks/knowledge-search/latest.json`
- CLI: `scripts/benchmark-knowledge-search.mjs`
- Runtime worker: `scripts/knowledge-benchmark-worker.py`
