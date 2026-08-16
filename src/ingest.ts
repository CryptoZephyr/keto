import { createHash } from "node:crypto";
import type { KetoConfig } from "./config.js";
import { assertIdempotencyKey, boltRun, withBoltSession } from "./hydra/bolt.js";
import type { CodeEntity, DependsOnEdge, ExtractResult } from "./types.js";

export const VERTEX_BATCH_SIZE = 32;
export const RELATIONSHIP_BATCH_SIZE = 32;

export const UPSERT_VERTICES = `UNWIND $rows AS row
MERGE (n {id: row.id})
SET n:CodeEntity,
    n.stable_key = row.stable_key,
    n.repository = row.repository,
    n.path = row.path,
    n.kind = row.kind,
    n.language = row.language,
    n.content_hash = row.content_hash`;

export const MERGE_RELATIONSHIPS = `UNWIND $rows AS row
MATCH (source:CodeEntity {id: row.source_id}),
      (destination:CodeEntity {id: row.destination_id})
MERGE (source)-[r:DEPENDS_ON {id: row.relationship_id}]->(destination)
SET r.stable_key = row.stable_key,
    r.kind = row.kind,
    r.specifier = row.specifier`;

export const DELETE_STALE_RELATIONSHIPS = `UNWIND $rows AS row
MATCH ()-[r:DEPENDS_ON {id: row.relationship_id}]->()
DELETE r`;

export const READ_VERTICES = `MATCH (n:CodeEntity)
RETURN n.id AS id, n.stable_key AS stable_key, n.path AS path, n.kind AS kind`;

export const READ_RELATIONSHIPS = `MATCH (source:CodeEntity)-[r:DEPENDS_ON]->(destination:CodeEntity)
RETURN r.id AS id, r.stable_key AS stable_key, r.kind AS kind, source.id AS source_id, destination.id AS destination_id`;

export function batchRows<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

export function mutationIdempotencyKey(
  operation: string,
  batchIndex: number,
  payload: unknown,
): string {
  const digest = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex")
    .slice(0, 16);
  const key = `keto.v1.${operation}.${batchIndex}.${digest}`;
  return assertIdempotencyKey(key);
}

export function vertexRows(entities: readonly CodeEntity[]): Array<Record<string, unknown>> {
  return entities.map((entity) => ({
    id: entity.id,
    stable_key: entity.stable_key,
    repository: entity.repository,
    path: entity.path,
    kind: entity.kind,
    language: entity.language,
    content_hash: entity.content_hash,
  }));
}

export function relationshipRows(
  relationships: readonly DependsOnEdge[],
): Array<Record<string, unknown>> {
  return relationships.map((rel) => ({
    source_id: rel.source_id,
    destination_id: rel.destination_id,
    relationship_id: rel.id,
    stable_key: rel.stable_key,
    kind: rel.kind,
    specifier: rel.specifier,
  }));
}

export interface GraphSnapshot {
  vertices: Array<{ id: number; stable_key: string; path: string; kind: string }>;
  relationships: Array<{
    id: number;
    stable_key: string;
    kind: string;
    source_id: number;
    destination_id: number;
  }>;
  bookmark?: string;
}

export interface IngestResult {
  vertexBatches: number;
  relationshipBatches: number;
  vertices: number;
  relationships: number;
  snapshot: GraphSnapshot;
  idempotencyKeys: string[];
}

export function compareSnapshotToExtract(
  snapshot: GraphSnapshot,
  extracted: ExtractResult,
): { match: boolean; detail: string } {
  const vertexKeys = new Set(snapshot.vertices.map((item) => item.stable_key));
  const extractVertexKeys = new Set(extracted.entities.map((item) => item.stable_key));
  const relKeys = new Set(snapshot.relationships.map((item) => item.stable_key));
  const extractRelKeys = new Set(extracted.relationships.map((item) => item.stable_key));
  const missingVertices = [...extractVertexKeys].filter((key) => !vertexKeys.has(key));
  const extraVertices = [...vertexKeys].filter((key) => !extractVertexKeys.has(key));
  const missingRels = [...extractRelKeys].filter((key) => !relKeys.has(key));
  const extraRels = [...relKeys].filter((key) => !extractRelKeys.has(key));
  const match =
    missingVertices.length === 0 &&
    extraVertices.length === 0 &&
    missingRels.length === 0 &&
    extraRels.length === 0 &&
    snapshot.vertices.length === extracted.entities.length &&
    snapshot.relationships.length === extracted.relationships.length;
  return {
    match,
    detail: match
      ? `graph matches extract vertices=${snapshot.vertices.length} relationships=${snapshot.relationships.length}`
      : `graph/extract mismatch missingV=${missingVertices.length} extraV=${extraVertices.length} missingR=${missingRels.length} extraR=${extraRels.length}`,
  };
}

export async function ingestExtract(
  config: KetoConfig,
  extracted: ExtractResult,
): Promise<IngestResult> {
  return withBoltSession(config, async (session) => {
    const idempotencyKeys: string[] = [];
    const vertices = vertexRows(extracted.entities);
    const relationships = relationshipRows(extracted.relationships);
    let vertexBatches = 0;
    for (const [index, rows] of batchRows(vertices, VERTEX_BATCH_SIZE).entries()) {
      const key = mutationIdempotencyKey("vtx", index, rows);
      idempotencyKeys.push(key);
      await boltRun(session, UPSERT_VERTICES, { rows }, key);
      vertexBatches += 1;
    }
    let relationshipBatches = 0;
    for (const [index, rows] of batchRows(relationships, RELATIONSHIP_BATCH_SIZE).entries()) {
      const key = mutationIdempotencyKey("rel", index, rows);
      idempotencyKeys.push(key);
      await boltRun(session, MERGE_RELATIONSHIPS, { rows }, key);
      relationshipBatches += 1;
    }
    const snapshot = await readGraphSnapshot(session);
    const stale = snapshot.relationships.filter(
      (rel) => !extracted.relationships.some((item) => item.id === numberValue(rel.id)),
    );
    if (stale.length > 0) {
      for (const [index, rows] of batchRows(
        stale.map((rel) => ({ relationship_id: numberValue(rel.id) })),
        RELATIONSHIP_BATCH_SIZE,
      ).entries()) {
        const key = mutationIdempotencyKey("del", index, rows);
        idempotencyKeys.push(key);
        await boltRun(session, DELETE_STALE_RELATIONSHIPS, { rows }, key);
      }
    }
    const finalSnapshot = await readGraphSnapshot(session);
    return {
      vertexBatches,
      relationshipBatches,
      vertices: extracted.entities.length,
      relationships: extracted.relationships.length,
      snapshot: finalSnapshot,
      idempotencyKeys,
    };
  });
}

export async function readBackGraph(config: KetoConfig): Promise<GraphSnapshot> {
  return withBoltSession(config, (session) => readGraphSnapshot(session));
}

async function readGraphSnapshot(
  session: Parameters<typeof boltRun>[0],
): Promise<GraphSnapshot> {
  const vertices = await boltRun(session, READ_VERTICES, {});
  const relationships = await boltRun(session, READ_RELATIONSHIPS, {});
  return {
    vertices: vertices.records.map((row) => ({
      id: numberValue(row.id),
      stable_key: String(row.stable_key),
      path: String(row.path),
      kind: String(row.kind),
    })),
    relationships: relationships.records.map((row) => ({
      id: numberValue(row.id),
      stable_key: String(row.stable_key),
      kind: String(row.kind),
      source_id: numberValue(row.source_id),
      destination_id: numberValue(row.destination_id),
    })),
    bookmark: relationships.bookmark ?? vertices.bookmark,
  };
}

function numberValue(value: unknown): number {
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && "toNumber" in value) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value);
}
