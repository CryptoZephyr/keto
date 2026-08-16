# Three-minute demo plan

Record this as a single take, voiceover over a Codespace terminal and a short
editor view of the fixture. Do not claim unmeasured speedups.

Total: 2:45–3:00.

## Beat 1 — Problem (0:00–0:30)

Monorepo CI either runs every test or guesses from package names. Coding
agents retrieve similar text and miss import chains, cycles, and the tests
that actually cover a change. An unsafe selector is worse than a slow one.

Show: `fixtures/monorepo/README.md` table (direct / two-hop / four-hop /
unaffected).

## Beat 2 — Product (0:30–0:55)

Keto extracts file-level JS/TS dependencies, stores them in HydraDB as
`CodeEntity` vertices and `DEPENDS_ON` edges, then asks HydraDB for bounded
incoming paths with `algo.MSpaths`. The CLI explains the blast radius and
runs only proven-safe Jest/Vitest files — or the full suite.

## Beat 3 — Working demo (0:55–2:20)

In a Codespace with the pinned image already up:

1. `curl -fsS http://127.0.0.1:9090/readyz`
2. `npm run keto:index -- --repo fixtures/monorepo`
   - Point at vertex/edge counts matching the fixture.
3. `npm run keto:explain -- --repo fixtures/monorepo --changed src/leaf.ts`
   - Four-hop path ending at `src/mid1.test.ts`.
4. `npm run keto:test -- --repo fixtures/monorepo --changed src/util.ts --dry-run`
   - Selected: `src/util.test.ts` only.
5. `npm run keto:test -- --repo fixtures/monorepo --changed src/dynamic.ts --dry-run`
   - Full suite, reason `dynamic_import`.
6. Stop HydraDB (`scripts/stop-hydradb.sh`) and rerun the util change.
   - Full suite, reason `hydradb_unavailable`.

Do not paste or read the bearer token.

## Beat 4 — Why HydraDB matters (2:20–2:55)

HydraDB is not a cache. It persists the graph, accepts batched `UNWIND`
mutations with `hydradb.idempotency_key`, and executes snapshot-consistent
multi-source path retrieval. Without it, Keto can still extract a graph and
must fail closed into the full suite — it cannot explain or safely select
tests.

Close on: MIT Keto + AGPL HydraDB as an external service; no speed claim
unless `docs/BENCHMARKS.md` has measured numbers.
