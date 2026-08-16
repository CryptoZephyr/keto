# Hackathon Task Checklist — Keto

**Hackathon Window:** August 12–20, 2026  
**Track:** 02 — Repositories, Dependencies and Code as Graphs  
**Current Status:** MVP implemented. HydraDB is started only in a Codespace (or equivalent remote Docker), never on the 4 GB laptop.

---

## Phase 0 — Eligibility and Zero-Cost Controls

- [x] Select the graph-native PR impact and smart test-routing concept.
- [x] Choose the name Keto.
- [x] Correct the design against HydraDB's current API and Cypher subset.
- [x] Initialize a fresh Git repository with no participant-authored commits before August 12, 2026.
- [x] Add MIT `LICENSE`, `.gitignore`, `.env.example`, and third-party attribution.
- [x] Create the public GitHub repository.
- [ ] Set Codespaces spending budget to `$0` and idle timeout to 5–10 minutes.
- [ ] Open the smallest 2-core Codespace and confirm remaining included quota.

## Phase 1 — Prove HydraDB Before Product Code

- [ ] Start pinned `ghcr.io/hydra-db/hydradb:0.1.1` inside Codespaces using `setup.md` (not on the 4 GB laptop).
- [ ] Confirm `/readyz`.
- [ ] Complete an HTTP write/read round trip.
- [ ] Verify Bolt connectivity with `neo4j-driver`.
- [x] Record the exact HydraDB image tag and upstream commit/release in the README.
- [x] Keep every HydraDB port private/loopback-only.

**Gate:** Do not build the parser until both HTTP and Bolt proof tests pass.

## Phase 2 — Known-Answer Fixture and Identity Model

- [x] Create a small JS/TS monorepo fixture with documented dependency paths.
- [x] Include direct, two-hop, and four-hop affected-test cases.
- [x] Include an unaffected test, a cycle, a dynamic import, and a root-config change.
- [x] Define deterministic non-negative integer IDs for vertices and relationships.
- [x] Store a versioned `stable_key` and fail on hash collisions.
- [x] Write expected impacted-test results as automated fixtures.

**Gate:** Expected answers must exist before traversal code.

## Phase 3 — Static Dependency Extractor

- [x] Parse static JS/TS imports and local CommonJS requires.
- [x] Normalize and resolve repository-relative paths.
- [x] Identify Jest/Vitest test files.
- [x] Emit `CodeEntity` vertices and `DEPENDS_ON` relationships.
- [x] Preserve dependency subtype as `kind = imports | tests`.
- [x] Report unresolved and dynamic imports as coverage warnings.
- [x] Unit-test Windows separators, aliases, cycles, missing files, and parse errors.

## Phase 4 — HydraDB Ingestion

- [x] Implement bounded Bolt `UNWIND` vertex upsert batches.
- [x] Implement bounded Bolt `UNWIND` relationship merge batches.
- [x] Send deterministic `hydradb.idempotency_key` Bolt transaction metadata and deterministic relationship IDs for safe retry behavior.
- [x] Delete or update stale relationships when a file changes.
- [ ] Confirm re-indexing the same fixture does not duplicate vertices or edges (requires live HydraDB in Codespaces).
- [ ] Read the graph back and compare counts/identities with the extractor output (requires live HydraDB in Codespaces).

**Gate:** Re-index twice and get the same graph.

## Phase 5 — Explainable Impact Retrieval

- [x] Build a safe literal-list encoder for `algo.MSpaths` configuration.
- [x] Reject control characters and enforce source-list/query-size limits.
- [x] Query incoming `DEPENDS_ON` paths with bounded `maxLen`, `pathCount`, `resultLimit`, and timeout.
- [x] Extract terminal test vertices from returned path objects.
- [x] Implement `keto explain --base <ref>` with human-readable paths and JSON output.
- [x] Compare every fixture result against known answers.
- [x] Treat errors, missing sources, empty unsafe results, budget limits, and inconsistencies as fallback conditions.

**Gate:** 100% recall on the checked-in fixture or no selected-test execution.

## Phase 6 — Safe Test Router

- [x] Implement `keto test --base <ref>` for Jest/Vitest.
- [x] Run the full suite for lockfiles, root configs, test configs, broad changes, or incomplete graph coverage.
- [x] Run the full suite when HydraDB is unavailable or times out.
- [x] Print why selected mode or fallback mode was chosen.
- [x] Add a dry-run mode.
- [x] Verify that an intentionally missed dependency triggers fallback rather than a false-safe result.

## Phase 7 — GitHub Action and Agent Context

- [x] Add `.github/workflows/keto.yml` after local/Codespaces CLI verification.
- [x] Emit a JSON impact report usable by a coding agent.
- [x] Add a PR summary showing affected files, tests, and dependency paths.
- [x] Keep the HydraDB token in GitHub secrets and never print it.
- [x] Ensure the Action fails safely into the full suite.

## Phase 8 — Indexer and Evidence

- [x] Establish the correct canonical-read baseline first.
- [ ] Start `graph-indexer` using the pinned image (optional; Codespaces only).
- [ ] Ingest, wait for indexing activity to settle, and stop mutations before timing queries.
- [ ] Benchmark at least one fixture and one real public repository (no numbers until measured).
- [x] Record graph size, machine size, cold/warm state, ingestion time, query median/p95, full-suite time, and selected-suite time.
- [x] Remove all unmeasured speed, scale, accuracy, and savings claims.

## Phase 9 — Submission

- [x] Complete README with setup, architecture, safety policy, measured results, HydraDB usage, and attribution.
- [ ] Confirm public repository, demo, and video links in a logged-out browser.
- [ ] Record a video no longer than three minutes: problem, product, working demo, and why HydraDB matters.
- [ ] Complete the submission form.
- [ ] Submit before August 20, 2026 at 11:59 PM PT.
- [ ] Keep time for a clean-room reproduction from the README.

---

## Explicitly Deferred Until the MVP Works

- Function-level call graphs
- Python/pytest support
- Dynamic-import inference
- Learned confidence weights
- Cross-repository ingestion
- IDE extension
- “Millions of edges” scale demonstration
