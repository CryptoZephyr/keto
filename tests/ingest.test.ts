import { describe, expect, it } from "vitest";
import {
  MERGE_RELATIONSHIPS,
  UPSERT_VERTICES,
  batchRows,
  compareSnapshotToExtract,
  mutationIdempotencyKey,
  relationshipRows,
  vertexRows,
} from "../src/ingest.js";
import { buildGraph } from "../src/extract.js";
import { assertIdempotencyKey } from "../src/hydra/bolt.js";

describe("ingest helpers", () => {
  it("builds bounded UNWIND batches and deterministic idempotency keys", () => {
    const graph = buildGraph({
      repository: "keto-fixture",
      files: {
        "src/util.ts": "export const n = 1;\n",
        "src/util.test.ts": 'import { n } from "./util";\nexport const m = n;\n',
      },
    });
    const vertices = vertexRows(graph.entities);
    const relationships = relationshipRows(graph.relationships);
    expect(UPSERT_VERTICES).toContain("UNWIND $rows AS row");
    expect(UPSERT_VERTICES).toContain("MERGE (n {id: row.id})");
    expect(MERGE_RELATIONSHIPS).toContain("CREATE (source)-[:DEPENDS_ON {id: row.relationship_id, stable_key: row.stable_key, kind: row.kind, specifier: row.specifier}]->(destination)");
    expect(batchRows(vertices, 1).length).toBe(vertices.length);
    const key = mutationIdempotencyKey("vtx", 0, vertices);
    expect(key).toBe(mutationIdempotencyKey("vtx", 0, vertices));
    expect(key).not.toBe(mutationIdempotencyKey("vtx", 1, vertices));
    expect(() => assertIdempotencyKey(key)).not.toThrow();
    expect(relationships[0]?.relationship_id).toBe(graph.relationships[0]?.id);
    const snapshot = {
      vertices: graph.entities.map((entity) => ({
        id: entity.id,
        stable_key: entity.stable_key,
        path: entity.path,
        kind: entity.kind,
      })),
      relationships: graph.relationships.map((rel) => ({
        id: rel.id,
        stable_key: rel.stable_key,
        kind: rel.kind,
        source_id: rel.source_id,
        destination_id: rel.destination_id,
      })),
    };
    expect(compareSnapshotToExtract(snapshot, graph).match).toBe(true);
  });
});
