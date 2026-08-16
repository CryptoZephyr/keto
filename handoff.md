# Handoff — Keto

**Date:** August 13, 2026  
**Directory:** `C:\Users\HomePC\Desktop\keto`  
**State:** Corrected pre-build documentation; implementation has not started

---

## Current Decision

Keto remains a Hack Hydra Track 02 project. It is now positioned as a graph-native PR impact and context engine for coding agents, with smart test routing as its executable proof.

The local 4 GB Windows laptop will not run Docker, WSL, Rust, or HydraDB. It is only the browser/editor client. A smallest-size GitHub Codespace will run both Keto and the pinned HydraDB container within the user's included quota, with a `$0` spending budget and short idle timeout.

---

## Corrections Applied

1. Replaced the unsupported mixed relationship query (`IMPORTS|CALLS`) and general path projection with HydraDB's native bounded `algo.MSpaths` procedure.
2. Unified traversable relationships as `DEPENDS_ON`; `imports` and `tests` are relationship properties.
3. Added deterministic non-negative integer identities, stable keys, and collision detection.
4. Replaced the incomplete HydraDB startup command with a pinned, complete Codespaces container setup and real write/read verification.
5. Made `graph-indexer` optional until canonical-read correctness is proven.
6. Added full-suite fallback rules for missing, stale, incomplete, rejected, or uncertain graph results.
7. Reclassified all performance and accuracy numbers as targets requiring measured evidence.
8. Chose MIT for Keto and documented HydraDB as an external AGPL-3.0 service.
9. Added zero-cost controls and removed the implication that Codespaces is unlimited free compute.

---

## Files

- `PRD.md` — corrected scope, positioning, safety policy, metrics, and submission definition.
- `architecture.md` — valid HydraDB graph model, ingestion form, native path query, consistency, and benchmark method.
- `setup.md` — zero-cost Codespaces workflow and complete pinned HydraDB startup/verification.
- `tasks.md` — gated build order focused on correctness before features or benchmarks.
- `memory.md` — persistent project constraints and technical decisions.
- `handoff.md` — this current-state summary.

---

## Immediate Next Steps

1. Review the corrected files.
2. Initialize a fresh Git repository and add the MIT license, `.gitignore`, `.env.example`, and README skeleton.
3. Create a public GitHub repository, set the Codespaces budget to `$0`, and open the smallest 2-core Codespace.
4. Follow `setup.md` until HTTP and Bolt both complete a real round trip.
5. Create the known-answer fixture before implementing the general parser.

Do not begin with function-level AST graphs, confidence learning, cross-repository support, or large-scale benchmarks. The first shippable vertical slice is:

```text
fixture repo -> extract static dependencies -> ingest HydraDB
-> diff one file -> retrieve path evidence -> run expected tests
-> fall back safely when evidence is incomplete
```

---

## Upstream Risks to Recheck

The review was anchored to HydraDB `main` commit `6a2fbb192f37f51a93690a2ae2d2f5e27e6e4219` and release image `0.1.1` on August 13, 2026. HydraDB moves quickly, so verify the current tip and releases before changing the pinned version.

Open upstream issues relevant to Keto at the time of review:

- #69: variable-length traversal can silently omit rows when a compiled index has a WAL overlay.
- #71: reachability semantics can differ by cache state and branch.
- #65: the single bearer token has broad namespace rights.
- #67: reads may fully materialize results before paging.

These are why Keto bounds queries, keeps ports private, validates a known-answer fixture, and falls back to the full suite.
