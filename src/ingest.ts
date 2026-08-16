import { createHash, randomUUID } from "node:crypto";
import type { KetoConfig } from "./config.js";
import { assertIdempotencyKey, boltRun, withBoltSession } from "./hydra/bolt.js";
import { httpQuery } from "./hydra/http.js";
import { IDENTITY_VERSION, type CodeEntity, type DependsOnEdge, type ExtractResult } from "./types.js";

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
    n.content_hash = row.content_hash,
    n.identity_version = row.identity_version`;

export const CREATE_RELATIONSHIPS = `UNWIND $rows AS row
MATCH (source:CodeEntity {id: row.source_id}), (destination:CodeEntity {id: row.destination_id})
CREATE (source)-[:DEPENDS_ON {
  id: row.relationship_id,
  stable_key: row.stable_key,
  kind: row.kind,
  specifier: row.specifier
}]->(destination)`;

export const CLEAR_GRAPH = `MATCH (n:CodeEntity) DETACH DELETE n`;

export const READ_VERTICES = `MATCH (n:CodeEntity)
RETURN n.id AS id,
       n.stable_key AS stable_key,
       n.repository AS repository,
       n.path AS path,
       n.kind AS kind,
       n.language AS language,
       n.content_hash AS content_hash,
       n.identity_version AS identity_version`;

// HydraDB 0.1.1 does not bind relationship variables for RETURN (unbound `r`/`dep`).
// Read topology from the endpoint vertices only.
export const READ_RELATIONSHIPS = `MATCH (source:CodeEntity)-[:DEPENDS_ON]->(destination:CodeEntity)
RETURN source.id AS source_id, source.stable_key AS source_key, destination.id AS destination_id, destination.stable_key AS dest_key`;

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

export function vertexRows(
  entities: readonly CodeEntity[],
  identityVersion = IDENTITY_VERSION,
): Array<Record<string, unknown>> {
  return entities.map((entity) => ({
    id: entity.id,
    stable_key: entity.stable_key,
    repository: entity.repository,
    path: entity.path,
    kind: entity.kind,
    language: entity.language,
    content_hash: entity.content_hash,
    identity_version: identityVersion,
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
  vertices: Array<{
    id: number;
    stable_key: string;
    repository: string;
    path: string;
    kind: string;
    language: string;
    content_hash: string;
    identity_version: number;
  }>;
  relationships: Array<{ source_id: number; destination_id: number }>;
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
  const vertexKeys = snapshot.vertices.map(snapshotVertexSignature).sort();
  const extractVertexKeys = extracted.entities
    .map((item) =>
      snapshotVertexSignature({
        ...item,
        identity_version: extracted.identity_version,
      }),
    )
    .sort();
  const relKeys = snapshot.relationships
    .map((item) => `${item.source_id}->${item.destination_id}`)
    .sort();
  const extractRelKeys = extracted.relationships
    .map((item) => `${item.source_id}->${item.destination_id}`)
    .sort();
  const missingVertices = multisetDifference(extractVertexKeys, vertexKeys);
  const extraVertices = multisetDifference(vertexKeys, extractVertexKeys);
  const missingRels = multisetDifference(extractRelKeys, relKeys);
  const extraRels = multisetDifference(relKeys, extractRelKeys);
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
  // HydraDB persists mutation idempotency records. Scope every replacement run
  // independently so clearing the graph never causes a prior batch to replay
  // as a no-op when the same snapshot is indexed again.
  const ingestRunId = randomUUID();
  const idempotencyKeys: string[] = [];
  const clearKey = mutationIdempotencyKey("clr", 0, {
    repository: extracted.repository,
    operation: "replace-codeentity-graph",
    ingestRunId,
  });
  idempotencyKeys.push(clearKey);
  await httpQuery(config, CLEAR_GRAPH, `keto-${clearKey}`);
  process.stdout.write("Cleared existing CodeEntity graph\n");

  return withBoltSession(config, async (session) => {
    const vertices = vertexRows(extracted.entities, extracted.identity_version);
    const relationships = relationshipRows(extracted.relationships);
    let vertexBatches = 0;
    for (const [index, rows] of batchRows(vertices, VERTEX_BATCH_SIZE).entries()) {
      const key = mutationIdempotencyKey("vtx", index, { ingestRunId, rows });
      idempotencyKeys.push(key);
      await boltRun(session, UPSERT_VERTICES, { rows }, config.queryTimeoutMs, key);
      vertexBatches += 1;
    }
    process.stdout.write(`Upserted vertex batches=${vertexBatches}\n`);
    let relationshipBatches = 0;
    for (const [index, rows] of batchRows(relationships, RELATIONSHIP_BATCH_SIZE).entries()) {
      const key = mutationIdempotencyKey("rel", index, { ingestRunId, rows });
      idempotencyKeys.push(key);
      await boltRun(
        session,
        CREATE_RELATIONSHIPS,
        { rows },
        config.queryTimeoutMs,
        key,
      );
      relationshipBatches += 1;
    }
    process.stdout.write(`Created relationship batches=${relationshipBatches}\n`);
    const finalSnapshot = await readGraphSnapshot(session, config.queryTimeoutMs);
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
  return withBoltSession(config, (session) =>
    readGraphSnapshot(session, config.queryTimeoutMs),
  );
}

export async function readGraphSnapshot(
  session: Parameters<typeof boltRun>[0],
  timeoutMs: number,
): Promise<GraphSnapshot> {
  const vertices = await boltRun(session, READ_VERTICES, {}, timeoutMs);
  const relationships = await boltRun(
    session,
    READ_RELATIONSHIPS,
    {},
    timeoutMs,
  );
  return {
    vertices: vertices.records.map((row) => ({
      id: numberValue(row.id),
      stable_key: String(row.stable_key),
      repository: String(row.repository),
      path: String(row.path),
      kind: String(row.kind),
      language: String(row.language),
      content_hash: String(row.content_hash),
      identity_version: numberValue(row.identity_version),
    })),
    relationships: relationships.records.map((row) => ({
      source_id: numberValue(row.source_id),
      destination_id: numberValue(row.destination_id),
    })),
    bookmark: relationships.bookmark ?? vertices.bookmark,
  };
}

function snapshotVertexSignature(vertex: GraphSnapshot["vertices"][number]): string {
  return JSON.stringify([
    vertex.id,
    vertex.stable_key,
    vertex.repository,
    vertex.path,
    vertex.kind,
    vertex.language,
    vertex.content_hash,
    vertex.identity_version,
  ]);
}

function multisetDifference(left: readonly string[], right: readonly string[]): string[] {
  const remaining = new Map<string, number>();
  for (const item of right) {
    remaining.set(item, (remaining.get(item) ?? 0) + 1);
  }
  const difference: string[] = [];
  for (const item of left) {
    const count = remaining.get(item) ?? 0;
    if (count === 0) {
      difference.push(item);
    } else if (count === 1) {
      remaining.delete(item);
    } else {
      remaining.set(item, count - 1);
    }
  }
  return difference;
}

function numberValue(value: unknown): number {
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && "toNumber" in value) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value);
}
