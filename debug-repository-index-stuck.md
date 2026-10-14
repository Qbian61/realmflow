# Debug Session: repository-index-stuck
- **Status**: [OPEN]
- **Issue**: Repository scan completes, but indexable files remain pending and the index never reaches a completed state.
- **Debug Server**: Pending
- **Log File**: .dbg/trae-debug-log-repository-index-stuck.ndjson

## Reproduction Steps
1. Open repository `ea-fin-rim-back`.
2. Run the check-and-index action.
3. Open the repository snapshot.
4. Observe that scan metadata is available, skipped files have reasons, and indexable files remain pending.

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | The index job remains pending because the worker is not running. | High | Low | Pending |
| B | The job is running but embedding generation is unavailable or blocked. | High | Medium | Pending |
| C | Qdrant is unavailable or writes never complete. | Medium | Medium | Pending |
| D | Indexed document states belong to a different generation than the snapshot view. | Medium | Medium | Pending |
| E | Indexing is progressing normally but slowly due to repository size. | Low | Low | Pending |
| F | Repository chunking repeatedly tokenizes the remaining text and has superlinear runtime. | High | Low | Confirmed |

## Log Evidence
- The latest job has remained `running` since 2026-10-12 23:18:41.
- All 2,086 document states remain `indexing` with the same update timestamp.
- The active staging generation has zero persisted documents and zero persisted chunks.
- Qdrant `/healthz` reports healthy.
- The active Sidecar consumes approximately one CPU core; process sampling shows the hot path in the tokenizer rather than ONNX inference.
- The first 32 repository documents total only 124,201 bytes, but no batch result has been persisted after 43 minutes of Sidecar CPU time.
- `chunk_text` repeatedly calls `count_tokens` for the full remaining text and additional candidate ranges for every emitted chunk.

## Verification Conclusion
Hypotheses A, B, C, D, and E are rejected by the durable job state, healthy
Qdrant process, empty staging generation, and Sidecar stack sample. The
confirmed root cause is F: repository indexing is stuck in a superlinear
tokenization path before the first batch can complete. A secondary UX issue
marks every repository document as `indexing` before any batch starts, so the
UI cannot communicate actual progress.

## Fix Verification
- `chunk_text` now tokenizes the complete text once and reuses absolute token
  offsets for chunk budgets and overlap boundaries.
- Exact token counts are computed only for final chunk contents, preserving the
  512-token model limit without repeatedly encoding candidate substrings.
- The regression test verifies that a 5,000-token plain-text document performs
  one full tokenization and one exact count per emitted chunk.
- Python Sidecar suite: 208 passed, 1 skipped.
- Real GTE tokenizer benchmark: approximately 156 KB of text produced 117
  chunks in 0.144 seconds, with one full tokenization, 117 final chunk counts,
  and a maximum chunk size of 393 tokens.
- The currently running index job still uses the pre-fix Sidecar process and
  remained at 0 persisted documents/chunks until the development app was
  restarted.
- Runtime verification after restart exposed an empty-current-generation edge
  case that selected the all-at-once incremental path. Empty manifests now fall
  back to the existing 32-document full-build batches.
- After the second restart, job `5429afe0-0474-44ae-af0d-3d5d503617a7`
  persisted its first 32 documents and 189 chunks in about five seconds. It
  subsequently reached 64 indexed documents and 419 persisted chunks while
  continuing normally.
- The interrupted pre-fix job was cancelled and its staging generation was
  marked failed by the normal recovery flow; no database records were edited
  manually.
- The desktop production build remains blocked by pre-existing component-system
  violations in `src/styles.css`; none of the reported files are part of this
  fix.
