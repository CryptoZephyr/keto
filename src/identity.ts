import { createHash } from "node:crypto";
import type { CodeEntity, DependsOnEdge, DependencyKind, EntityKind } from "./types.js";
import { IDENTITY_VERSION } from "./types.js";

export { IDENTITY_VERSION };

export class CollisionError extends Error {
  readonly collisions: IdentityCollision[];

  constructor(collisions: IdentityCollision[]) {
    const preview = collisions
      .slice(0, 3)
      .map((c) => `id=${c.id} keys=${c.stable_keys.join(",")}`)
      .join("; ");
    super(`identity hash collision: ${preview}`);
    this.name = "CollisionError";
    this.collisions = collisions;
  }
}

export interface IdentityCollision {
  id: number;
  stable_keys: string[];
}

export function normalizePath(input: string): string {
  return input
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/\/{2,}/g, "/")
    .replace(/\/+$/, "");
}

export function languageForPath(path: string): string {
  const normalized = normalizePath(path).toLowerCase();
  if (/\.(tsx|ts|mts|cts)$/.test(normalized)) {
    return "typescript";
  }
  if (/\.(jsx|js|mjs|cjs)$/.test(normalized)) {
    return "javascript";
  }
  return "unknown";
}

export function isTestPath(path: string): boolean {
  const normalized = normalizePath(path);
  if (/(?:^|\/)__tests__\//.test(normalized)) {
    return true;
  }
  return /\.(?:test|spec)\.(?:[cm]?[jt]sx?)$/.test(normalized);
}

export function entityKindForPath(path: string): EntityKind {
  return isTestPath(path) ? "test" : "file";
}

export function stableKey(
  repository: string,
  path: string,
  kind: EntityKind,
): string {
  return `${repository}:${normalizePath(path)}:${kind}`;
}

export function relationshipStableKey(
  sourceKey: string,
  kind: DependencyKind,
  destinationKey: string,
  specifier: string,
): string {
  return `${sourceKey}>${kind}>${destinationKey}|${specifier}`;
}

/**
 * Versioned SHA-256 material → non-negative 53-bit integer (JSON-safe).
 * Exported so tests drive the same hasher the indexer uses.
 */
export function hashToId(material: string): number {
  const digest = createHash("sha256").update(material).digest();
  const n = digest.readBigUInt64BE(0) & ((1n << 53n) - 1n);
  return Number(n);
}

export function entityMaterial(
  repository: string,
  path: string,
  kind: EntityKind,
): string {
  return `v${IDENTITY_VERSION}|entity|${repository}|${normalizePath(path)}|${kind}`;
}

export function relationshipMaterial(
  sourceId: number,
  destinationId: number,
  kind: DependencyKind,
  specifier: string,
): string {
  return `v${IDENTITY_VERSION}|rel|${sourceId}|${destinationId}|${kind}|${specifier}`;
}

export function entityId(
  repository: string,
  path: string,
  kind: EntityKind,
): number {
  return hashToId(entityMaterial(repository, path, kind));
}

export function relationshipId(
  sourceId: number,
  destinationId: number,
  kind: DependencyKind,
  specifier: string,
): number {
  return hashToId(relationshipMaterial(sourceId, destinationId, kind, specifier));
}

export function contentHash(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

export function detectCollisions(
  items: ReadonlyArray<{ id: number; stable_key: string }>,
): IdentityCollision[] {
  const byId = new Map<number, Set<string>>();
  for (const item of items) {
    const keys = byId.get(item.id) ?? new Set<string>();
    keys.add(item.stable_key);
    byId.set(item.id, keys);
  }
  const collisions: IdentityCollision[] = [];
  for (const [id, keys] of byId) {
    if (keys.size > 1) {
      collisions.push({ id, stable_keys: [...keys].sort() });
    }
  }
  return collisions.sort((a, b) => a.id - b.id);
}

export function assertNoCollisions(
  items: ReadonlyArray<{ id: number; stable_key: string }>,
): void {
  const collisions = detectCollisions(items);
  if (collisions.length > 0) {
    throw new CollisionError(collisions);
  }
}

export function assignEntityIdentity(
  repository: string,
  path: string,
  source: string,
  kind: EntityKind = entityKindForPath(path),
): CodeEntity {
  const normalized = normalizePath(path);
  return {
    id: entityId(repository, normalized, kind),
    stable_key: stableKey(repository, normalized, kind),
    repository,
    path: normalized,
    kind,
    language: languageForPath(normalized),
    content_hash: contentHash(source),
  };
}

export function assignRelationshipIdentity(
  source: CodeEntity,
  destination: CodeEntity,
  kind: DependencyKind,
  specifier: string,
): DependsOnEdge {
  const id = relationshipId(source.id, destination.id, kind, specifier);
  return {
    id,
    stable_key: relationshipStableKey(
      source.stable_key,
      kind,
      destination.stable_key,
      specifier,
    ),
    source_id: source.id,
    destination_id: destination.id,
    source_path: source.path,
    destination_path: destination.path,
    kind,
    specifier,
  };
}
