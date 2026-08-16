# Product Requirements Document (PRD) — Keto

**Project Name:** Keto  
**Tagline:** Graph-native PR impact analysis and smart test routing for coding agents  
**Hackathon:** Hack Hydra 2026 — Track 02: Repositories, Dependencies and Code as Graphs  
**Project License:** MIT  
**Database Dependency:** HydraDB, used as an external AGPL-3.0 service through Bolt/HTTP

---

## 1. Executive Summary

Keto is a code-graph engine that explains the blast radius of a pull request and runs the tests that cover the affected dependency paths. It is designed for monorepos and coding agents that need structural context rather than semantically similar code chunks.

Keto extracts file-level dependencies and test relationships, assigns deterministic integer identities, ingests the graph into HydraDB, and asks HydraDB for bounded reverse-dependency paths from changed files. The CLI turns those paths into:

- an explanation of which files and tests are affected;
- graph context that a coding agent can use;
- a conservative list of tests to run; and
- a full-suite fallback whenever the graph is incomplete, stale, ambiguous, or outside a proven-safe boundary.

HydraDB performs essential work: durable graph storage, batched mutations, indexed entity lookup, snapshot-consistent path retrieval, and bounded multi-hop traversal. Without HydraDB, Keto loses its persistent dependency graph and its graph-native impact analysis.

---

## 2. Problem

1. Monorepo CI often runs far more tests than a change can affect.
2. Package-level selectors miss useful file-to-file and test-to-code relationships.
3. Coding agents retrieve similar text but often miss call chains, importing files, configuration dependencies, and tests.
4. An unsafe test selector is worse than a slow one, so impact analysis must explain its evidence and fail closed.

---

## 3. Product Positioning

Keto is not presented as a replacement for every feature in Nx, Turborepo, Bazel, or a full static-analysis platform. The hackathon product is a focused proof that HydraDB can serve graph context for a coding agent and use the same graph to drive a safe CI decision.

Primary user journey:

1. A developer or agent changes one or more files.
2. Keto computes the Git diff and resolves the changed files in HydraDB.
3. HydraDB returns bounded incoming dependency paths.
4. Keto displays the affected files, test files, and path evidence.
5. Keto runs the selected tests, or the full suite if the result is not demonstrably safe.

---

## 4. MVP Scope

### 4.1 Static JS/TS graph extraction

- Parse static ES module imports and CommonJS `require` calls that resolve to local files.
- Recognize Jest/Vitest test files by configurable filename patterns.
- Normalize repository-relative paths.
- Record unresolved or dynamic imports as coverage warnings.

### 4.2 HydraDB ingestion

- Assign every entity a deterministic non-negative integer `id` derived from repository identity, normalized path, and entity kind.
- Store the human-readable identity in `stable_key` and `path` properties.
- Batch vertex upserts and relationship mutations with `UNWIND` over Bolt, using caller-supplied idempotency metadata for safe retries.
- Use deterministic relationship IDs so re-indexing is retryable and idempotent.

### 4.3 Graph-native impact retrieval

- Model all traversable dependency evidence with the supported relationship type `DEPENDS_ON`.
- Preserve the dependency subtype in a relationship property such as `kind = "imports"` or `kind = "tests"`.
- Use HydraDB's native `algo.MSpaths` procedure for multi-source bounded path retrieval.
- Traverse incoming relationships from changed code to its dependents and tests.
- Limit traversal depth, path count, result count, and runtime.

### 4.4 Explain and test commands

- `keto explain --base <git-ref>` prints affected files, affected tests, and dependency paths.
- `keto test --base <git-ref>` passes proven-safe test files to Jest or Vitest.
- `keto index` builds or refreshes the repository graph.
- JSON output is available for a coding agent or GitHub Action.

### 4.5 Safety fallback

Run the full test suite when any of these is true:

- a changed path is absent from the graph;
- parsing or module resolution is incomplete;
- a dynamic import cannot be resolved;
- root configuration, lockfiles, test configuration, or shared build tooling changed;
- HydraDB is unavailable, times out, rejects the query, or reaches a query budget;
- graph validation fails or the result conflicts with the known-answer fixture; or
- no affected test is returned for a non-trivial source change unless that case is explicitly allow-listed.

---

## 5. Deferred Features

These are stretch goals after the file-level journey works end to end:

- function-level call graphs;
- Python and pytest support;
- dynamic-import inference;
- cross-repository graphs;
- confidence weights learned from historical CI;
- editor extension integration; and
- very-large-scale ingestion claims.

---

## 6. Success Criteria

The following are targets, not pre-existing results:

- **Correctness:** 100% recall on a checked-in known-answer fixture. Any uncertainty triggers the full-suite fallback.
- **Product completeness:** one command indexes a fixture repo; one changed-file scenario returns path evidence and runs the expected tests.
- **HydraDB proof:** the demo shows real writes, reads, and native path retrieval against HydraDB, plus behavior when HydraDB is unavailable.
- **Measured speedup:** report full-suite time, selected-suite time, indexing time, and HydraDB query time on the same fixture and machine.
- **Transparency:** every selected test includes at least one dependency path explaining why it was selected.

Claims such as sub-second traversal, 60–80% CI savings, 99.9% precision, or millions of edges must appear in the final README only if reproduced and labelled with the dataset, hardware, HydraDB version, graph size, and methodology.

---

## 7. Submission Definition of Done

- Public GitHub repository with no participant-authored commits before August 12, 2026.
- MIT license for Keto and clear attribution for HydraDB and all third-party code/datasets.
- Reproducible zero-cost Codespaces setup.
- Working ingestion, explanation, and test-routing journey.
- Known-answer fixture and automated correctness checks.
- README explaining exactly where HydraDB is used and what Keto loses without it.
- Publicly accessible demo link, if deployed.
- Demo video no longer than three minutes.
- Submission form completed before August 20, 2026 at 11:59 PM PT.
