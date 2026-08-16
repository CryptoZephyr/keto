# Project Memory and Decisions — Keto

**Project:** Keto  
**Hackathon:** Hack Hydra 2026  
**Track:** 02 — Repositories, Dependencies and Code as Graphs  
**Last corrected:** August 13, 2026

---

## Product Decision

Keto is a graph-native PR impact and context engine for coding agents. It extracts a repository dependency graph, stores and traverses it in HydraDB, explains affected paths, and safely selects Jest/Vitest tests. Smart test routing is the working demonstration; agent context is the direct alignment with Track 02-B.

HydraDB must do real work:

- persist vertices and relationships;
- accept batched graph mutations;
- resolve changed entities by indexed properties;
- execute snapshot-consistent bounded native path retrieval; and
- provide the dependency-path evidence used by the product decision.

---

## Hardware and Cost Decision

- Local host: Windows 11 laptop with 4 GB RAM.
- The local host must not run Docker Desktop, WSL, Rust builds, or HydraDB.
- GitHub Codespaces runs both Keto and the HydraDB containers remotely.
- Use the smallest 2-core Codespace, a `$0` spending budget, and a 5–10 minute idle timeout.
- Included quota is finite; stop the Codespace whenever inactive and check usage before relying on it.
- Pin the HydraDB image used for the demo. The reviewed release is `ghcr.io/hydra-db/hydradb:0.1.1`.

---

## Graph Decisions

- Vertices use label `CodeEntity`.
- HydraDB identity is a deterministic non-negative integer `id`.
- Human-readable uniqueness is stored in `stable_key`.
- Hash collisions abort indexing.
- Traversable relationships use one type: `DEPENDS_ON`.
- Dependency subtype is stored as `kind = imports | tests`.
- Edge direction is dependent → dependency.
- Impact analysis starts at changed code and traverses `incoming` relationships.
- Batched ingestion uses transport-level `UNWIND` through Bolt with deterministic `hydradb.idempotency_key` transaction metadata.
- Multi-source path retrieval uses `algo.MSpaths`; unsupported mixed-type patterns and general path projections are not used.

---

## Safety Decisions

- Correctness is established on a checked-in known-answer fixture before the real-repository demo.
- A selected-test result is allowed only when graph coverage is complete and the query succeeds within all limits.
- Missing files, parse failures, dynamic imports, root configuration changes, HydraDB errors, timeouts, budget rejection, suspicious empty results, or fixture mismatches trigger the full suite.
- `graph-indexer` is not a prerequisite for the first correctness milestone.
- Benchmark ingestion and querying are separate; timed queries run after indexing settles and without concurrent mutations.
- HydraDB ports remain private to the Codespace and the development token is never committed or exposed.

---

## Scope Decisions

MVP:

- JS/TS static imports;
- Jest/Vitest test files;
- file-level dependency graph;
- deterministic ingestion;
- Git-diff impact explanation;
- bounded native path retrieval;
- selected-test execution plus full-suite fallback;
- GitHub Action and coding-agent JSON report; and
- measured evidence on a fixture and one real public repository.

Deferred:

- function-level calls;
- Python/pytest;
- dynamic-import inference;
- confidence learning;
- cross-repository ingestion;
- IDE extension; and
- large-scale claims.

---

## Evidence and Claim Policy

Sub-second traversal, CI percentage savings, selection precision, and graph scale are targets until reproduced. Any published result must name the dataset/repository commit, graph size, Codespaces machine, HydraDB version, index state, run count, and measurement method.

Keto uses the MIT license. HydraDB remains an external AGPL-3.0 service accessed through Bolt/HTTP and must be attributed, along with all other libraries and datasets.

The hackathon submission requires a public repository, open-source license, complete source and setup instructions, attribution, a demo video no longer than three minutes, and the official form before August 20, 2026 at 11:59 PM PT.
