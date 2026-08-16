# Keto

Graph-native PR impact analysis and safe test routing for coding agents.

Keto extracts a file-level JS/TS dependency graph, stores it in
[HydraDB](https://github.com/hydra-db/hydradb), and uses HydraDB’s native
`algo.MSpaths` procedure to explain which files and tests a change can reach.
It then runs those Jest/Vitest files — or the full suite when the graph is
incomplete, stale, or the query is unsafe.

**Hackathon:** Hack Hydra 2026, Track 02 — Repositories, Dependencies and Code as Graphs
**License:** MIT (this repository). HydraDB is an external AGPL-3.0 service.

## Where HydraDB is used

HydraDB performs essential work. Keto uses it to:

1. Persist `CodeEntity` vertices and `DEPENDS_ON` relationships, including
   stable relationship identity, kind, and import specifier properties.
2. Accept batched Bolt `UNWIND` mutations with caller-supplied
   `hydradb.idempotency_key` transaction metadata.
3. Look up changed entities by `stable_key`.
4. Execute snapshot-consistent, bounded multi-source path retrieval
   (`algo.MSpaths`, incoming `DEPENDS_ON` only).
5. Return the dependency-path evidence shown by `keto explain` and used by
   `keto test`.
6. Re-read vertex hashes, identity version, counts, and relationship topology
   before and after traversal so Keto can reject a stale or changing graph.

`keto index` replaces the graph's `CodeEntity` subgraph before ingesting the
current extract. This removes stale vertices and edges, but means one Keto
repository owns a HydraDB graph/namespace in the MVP. Keto writes relationship
properties inline because HydraDB 0.1.1 does not reliably bind a relationship
variable for a later `SET` or `RETURN`. Read-back therefore validates the exact
endpoint multiset; vertex content hashes and identity version provide the
freshness proof. The checked-in live workflow contains the relationship-
property proof, but the audit-corrected workflow must pass before that new
write path is described as live-verified.

Pinned image: `ghcr.io/hydra-db/hydradb:0.1.1`
API review commit: `6a2fbb192f37f51a93690a2ae2d2f5e27e6e4219`

## What Keto loses without HydraDB

Without a reachable HydraDB node, Keto can still parse a repository and emit
an extract. It cannot:

- persist or re-read a graph
- prove that a second index is idempotent
- retrieve incoming dependency paths
- select tests

`keto test` then **fails closed** and runs the full suite, printing the
reason (`hydradb_unavailable`, timeout, reject, or budget).

Keto does **not** substitute an in-memory graph or Neo4j for HydraDB while
claiming HydraDB-backed results.

## Safety policy

Selected-test mode is allowed only when every changed source file is indexed,
the entire extract has no parse/dynamic/unresolved/missing-file warning, and
the live HydraDB graph exactly matches the current vertex hashes, identity
version, counts, and relationship topology both before and after traversal.
Keto also enumerates the extractor topology only as a verifier: selected mode
requires the complete returned HydraDB path multiset to match and to fit below
`maxLen`, `pathCount`, and `resultLimit`. It never uses that local enumeration
as substitute selected-test evidence. Otherwise Keto runs the full suite for:

- missing or unindexed changed files
- parse failures
- unresolved or dynamic imports
- root config, lockfiles, test config, or shared tooling changes
- HydraDB unavailable / timeout / reject / budget
- stale graph content, identity version, counts, or topology
- traversal depth, per-source path, overall result, or execution timeout risk
- missing or unexpected HydraDB path evidence
- fixture mismatch
- a suspicious empty result on a non-trivial source change

See `src/fallback.ts` and `fixtures/expected/fallback-cases.json`.

## Codespaces setup (do not run HydraDB on the 4 GB laptop)

1. Use a GitHub account with remaining included Codespaces quota.
2. Set the Codespaces spending budget to `$0` (or stop-when-limit-reached).
3. Create the **smallest 2-core** Codespace from this repository.
4. Set idle timeout to 5–10 minutes and stop the Codespace when idle.
5. Ports `7687`, `8443`, and `9090` stay **loopback-only**. Do not change
   Codespaces port visibility to public.

```bash
npm install
cp .env.example .env
bash scripts/start-hydradb.sh
node scripts/hydra-proof.mjs
npm test
npm run keto:index -- --repo fixtures/monorepo
npm run keto:explain -- --repo fixtures/monorepo --changed src/util.ts
npm run keto:test -- --repo fixtures/monorepo --changed src/util.ts --dry-run
```

The HTTP proof must return vertex id `2`. `keto index` clears the existing
`CodeEntity` graph before writing the requested repository, so do not share one
MVP graph/namespace between repositories.

Full container flags live in `scripts/start-hydradb.sh`.

`graph-indexer` is optional and must not be required for the first
correctness milestone. After fixture recall passes on canonical reads, see
`scripts/start-indexer.sh`.

## Commands

```text
keto index   --repo <path>
keto explain --repo <path> --base <git-ref> [--json] [--changed <file>]
keto test    --repo <path> --base <git-ref> [--dry-run] [--json] [--changed <file>]
```

`--changed` is for documented fixture scenarios and CI overrides. Production
use is `--base <git-ref>`.

## Known-answer fixture

`fixtures/monorepo` contains direct, two-hop, and four-hop affected tests, an
unaffected test, a cycle, a dynamic import, a missed non-literal require, an
alias import, and a root-config change. Expected extract identities live in
`fixtures/expected/extract.json`. Expected impact cases live in
`fixtures/monorepo/keto.fixture.json`.

Because coverage warnings are global and conservative, this intentionally
unsafe fixture falls back for every changed file. The pinned live verification
workflow creates a warning-free copy to prove selected traversal, then uses
the original fixture to prove warning fallback.

## Benchmarks and claims

Measured results, or an explicit statement that none exist, are in
`docs/BENCHMARKS.md`. This README does not claim sub-second traversal,
CI percentage savings, precision, or graph scale.

## Attribution

See `THIRD_PARTY.md` and `LICENSE`. Never commit `.env`, `.hydradb/`, or the
live auth token.
