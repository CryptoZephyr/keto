import { normalizePath } from "./identity.js";
import type {
  CoverageWarning,
  ExtractResult,
  FixtureComparison,
} from "./types.js";

export interface ExpectedExtract {
  repository: string;
  identity_version: number;
  entities: Array<{
    id: number;
    stable_key: string;
    path: string;
    kind: "file" | "test";
  }>;
  relationships: Array<{
    id: number;
    stable_key: string;
    source_path: string;
    destination_path: string;
    kind: "imports" | "tests";
    specifier: string;
  }>;
  warnings: CoverageWarning[];
}

export interface ExpectedImpactCase {
  id: string;
  changed: string[];
  affected_tests?: string[];
  must_not_select?: string[];
  fallback?: string;
}

export function compareExtractedGraph(
  actual: ExtractResult,
  expected: ExpectedExtract,
): FixtureComparison {
  const missing: string[] = [];
  const unexpected: string[] = [];

  if (actual.repository !== expected.repository) {
    missing.push(`repository=${expected.repository}`);
    unexpected.push(`repository=${actual.repository}`);
  }
  if (actual.identity_version !== expected.identity_version) {
    missing.push(`identity_version=${expected.identity_version}`);
    unexpected.push(`identity_version=${actual.identity_version}`);
  }

  const actualEntities = new Map(
    actual.entities.map((entity) => [entity.stable_key, entity]),
  );
  const expectedEntities = new Map(
    expected.entities.map((entity) => [entity.stable_key, entity]),
  );
  for (const [key, entity] of expectedEntities) {
    const found = actualEntities.get(key);
    if (!found) {
      missing.push(`entity:${key}`);
      continue;
    }
    if (found.id !== entity.id) {
      missing.push(`entity-id:${key}=${entity.id}`);
      unexpected.push(`entity-id:${key}=${found.id}`);
    }
    if (found.path !== normalizePath(entity.path) || found.kind !== entity.kind) {
      missing.push(`entity-meta:${key}`);
    }
  }
  for (const key of actualEntities.keys()) {
    if (!expectedEntities.has(key)) {
      unexpected.push(`entity:${key}`);
    }
  }

  const actualRels = new Map(
    actual.relationships.map((rel) => [rel.stable_key, rel]),
  );
  const expectedRels = new Map(
    expected.relationships.map((rel) => [rel.stable_key, rel]),
  );
  for (const [key, rel] of expectedRels) {
    const found = actualRels.get(key);
    if (!found) {
      missing.push(`rel:${key}`);
      continue;
    }
    if (found.id !== rel.id) {
      missing.push(`rel-id:${key}=${rel.id}`);
      unexpected.push(`rel-id:${key}=${found.id}`);
    }
    if (
      found.source_path !== normalizePath(rel.source_path) ||
      found.destination_path !== normalizePath(rel.destination_path) ||
      found.kind !== rel.kind ||
      found.specifier !== rel.specifier
    ) {
      missing.push(`rel-meta:${key}`);
    }
  }
  for (const key of actualRels.keys()) {
    if (!expectedRels.has(key)) {
      unexpected.push(`rel:${key}`);
    }
  }

  const warningKey = (warning: CoverageWarning): string =>
    `${warning.type}|${normalizePath(warning.path)}|${warning.specifier ?? ""}`;
  const actualWarnings = new Set(actual.warnings.map(warningKey));
  const expectedWarnings = new Set(expected.warnings.map(warningKey));
  for (const key of expectedWarnings) {
    if (!actualWarnings.has(key)) missing.push(`warning:${key}`);
  }
  for (const key of actualWarnings) {
    if (!expectedWarnings.has(key)) unexpected.push(`warning:${key}`);
  }

  const match = missing.length === 0 && unexpected.length === 0;
  return {
    match,
    missing,
    unexpected,
    detail: match
      ? "extract matches fixture"
      : `extract mismatch missing=${missing.length} unexpected=${unexpected.length}`,
  };
}

export function compareImpact(
  actualTests: readonly string[],
  expectedTests: readonly string[],
): FixtureComparison {
  const actual = new Set(actualTests.map(normalizePath));
  const expected = new Set(expectedTests.map(normalizePath));
  const missing = [...expected].filter((path) => !actual.has(path)).sort();
  const unexpected = [...actual].filter((path) => !expected.has(path)).sort();
  const match = missing.length === 0 && unexpected.length === 0;
  return {
    match,
    missing,
    unexpected,
    detail: match
      ? "impact matches fixture"
      : `impact mismatch missing=${missing.join(",")} unexpected=${unexpected.join(",")}`,
  };
}

export function recallIsComplete(comparison: FixtureComparison): boolean {
  return comparison.match && comparison.missing.length === 0;
}

export function findImpactCase(
  cases: ExpectedImpactCase[],
  changed: readonly string[],
): ExpectedImpactCase | undefined {
  const key = changed.map(normalizePath).sort().join("|");
  return cases.find(
    (item) => item.changed.map(normalizePath).sort().join("|") === key,
  );
}
