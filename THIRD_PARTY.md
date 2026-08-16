# Third-party attribution

Keto is MIT-licensed. The following components are used by or with Keto and
remain under their own licenses.

## HydraDB (external service)

- Project: [hydra-db/hydradb](https://github.com/hydra-db/hydradb)
- License: GNU Affero General Public License v3.0
- Role: External graph database accessed over Bolt 5.x and HTTP. Keto does not
  vendor HydraDB source and does not distribute a modified HydraDB binary.
- Pinned image: `ghcr.io/hydra-db/hydradb:0.1.1`
- Upstream commit used for API review: `6a2fbb192f37f51a93690a2ae2d2f5e27e6e4219`

Running HydraDB yourself is subject to AGPL-3.0. Keto talks to it as a
networked service.

## Runtime and test libraries

Exact versions are recorded in `package-lock.json` after `npm install`.

| Package | Typical license | Use |
|---|---|---|
| `neo4j-driver` | Apache-2.0 | Bolt client for HydraDB |
| `typescript` | Apache-2.0 | JS/TS parse and typecheck of Keto; extractor parser |
| `tsx` | MIT | Development CLI runner |
| `vitest` | MIT | Keto automated tests and the fixture test runner |
| `@types/node` | MIT | Type definitions |

## Datasets

The checked-in known-answer fixture under `fixtures/monorepo` is original Keto
material, MIT-licensed with the rest of this repository.

Any additional public repository used only for measured benchmarks is named,
with commit SHA, in `docs/BENCHMARKS.md`. Those repositories keep their own
licenses; Keto does not relicense them.
