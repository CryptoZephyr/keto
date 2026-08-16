import { describe, expect, it } from "vitest";
import {
  CLEAR_GRAPH,
  CREATE_RELATIONSHIPS,
  READ_RELATIONSHIPS,
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
    expect(UPSERT_VERTICES).toContain(
      "n.identity_version = row.identity_version",
    );
    expect(CREATE_RELATIONSHIPS).toContain("CREATE (source)-[:DEPENDS_ON {");
    expect(CREATE_RELATIONSHIPS).not.toContain("MERGE (source)-[:DEPENDS_ON");
    expect(CREATE_RELATIONSHIPS).toContain("id: row.relationship_id");
    expect(CREATE_RELATIONSHIPS).toContain("stable_key: row.stable_key");
    expect(CREATE_RELATIONSHIPS).toContain("kind: row.kind");
    expect(CREATE_RELATIONSHIPS).toContain("specifier: row.specifier");
    expect(CLEAR_GRAPH).toContain("DETACH DELETE n");
    expect(READ_RELATIONSHIPS).toContain("MATCH (source:CodeEntity)-[:DEPENDS_ON]->(destination:CodeEntity)");
    expect(READ_RELATIONSHIPS).not.toMatch(/\[[A-Za-z]+:DEPENDS_ON\]/);
    expect(batchRows(vertices, 1).length).toBe(vertices.length);
    const key = mutationIdempotencyKey("vtx", 0, vertices);
    expect(key).toBe(mutationIdempotencyKey("vtx", 0, vertices));
    expect(key).not.toBe(mutationIdempotencyKey("vtx", 1, vertices));
    expect(() => assertIdempotencyKey(key)).not.toThrow();
    expect(relationships[0]?.relationship_id).toBe(graph.relationships[0]?.id);
    expect(vertices[0]?.identity_version).toBe(graph.identity_version);
    const snapshot = {
      vertices: graph.entities.map((entity) => ({
        id: entity.id,
        stable_key: entity.stable_key,
        repository: entity.repository,
        path: entity.path,
        kind: entity.kind,
        language: entity.language,
        content_hash: entity.content_hash,
        identity_version: graph.identity_version,
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

    const staleSnapshot = structuredClone(snapshot);
    staleSnapshot.vertices[0]!.content_hash = "stale-content-hash";
    expect(compareSnapshotToExtract(staleSnapshot, graph)).toEqual(
      expect.objectContaining({ match: false }),
    );
  });
});
