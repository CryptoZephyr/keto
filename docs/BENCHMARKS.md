# Benchmarks

No speed, scale, accuracy, or CI-savings claim is published until this file
records a measured run with every field below.

HydraDB image: `ghcr.io/hydra-db/hydradb:0.1.1`
HydraDB commit used for API review: `6a2fbb192f37f51a93690a2ae2d2f5e27e6e4219`

## Required fields

Each measured row must name:

- dataset / repository commit
- graph size (vertices, relationships)
- machine (Codespaces SKU or equivalent)
- HydraDB version (image tag + digest if known)
- index state (`graph-indexer` running/settled, or canonical reads only)
- cold vs warm query state
- run count
- method (how the clock was started and stopped)
- ingestion duration
- HydraDB query median and p95
- full-suite duration
- selected-suite duration

## Recorded runs

No HydraDB-backed timing run has been committed from the local 4 GB Windows
editor host. That host is not permitted to run Docker, WSL, Rust, or HydraDB.

When a Codespace or GitHub Actions runner completes `scripts/start-hydradb.sh`
and `npm run keto:index -- --repo fixtures/monorepo`, append a row here. Until
then this project makes **zero** performance claims.

### Fixture (pending live HydraDB)

| Field | Value |
|---|---|
| dataset | `fixtures/monorepo` (this repository) |
| commit | *fill after measurement* |
| vertices / relationships | see `fixtures/expected/extract.json` |
| machine | *not measured* |
| HydraDB | `ghcr.io/hydra-db/hydradb:0.1.1` |
| index state | canonical reads; indexer not required |
| cold / warm | *not measured* |
| run count | 0 |
| method | *not measured* |
| ingestion | *not measured* |
| query median / p95 | *not measured* |
| full-suite | *not measured* |
| selected-suite | *not measured* |

### Public repository (pending)

Pick a small public JS/TS repository, record its commit SHA, index it in the
same Codespace as the fixture, and add a second table. Do not reuse fixture
numbers for that row.

## Method (when measuring)

1. Ingest first. Do not mutate during timed queries.
2. If `graph-indexer` is used, wait until logs show settled work, then time
   queries separately from ingestion.
3. Repeat the impact query at least 11 times; drop the first (cold) sample
   from the warm median/p95 or report cold and warm as two rows.
4. Full-suite and selected-suite times are wall-clock of `keto test` on the
   same machine, same commit, same HydraDB snapshot.
