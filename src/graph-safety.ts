import { normalizePath } from "./identity.js";
import type { ExtractResult, GraphPath } from "./types.js";

export interface TraversalLimits {
  maxLen: number;
  pathCount: number;
  resultLimit: number;
}

export interface TraversalEnvelope {
  limitExceeded: boolean;
  details: string[];
  expectedPaths: string[][];
}

interface TraversalEdge {
  relationshipId: number;
  sourceId: number;
}

interface TraversalState {
  nodeIds: number[];
  paths: string[];
  depth: number;
}

export function analyzeTraversalEnvelope(
  extract: ExtractResult,
  changedPaths: readonly string[],
  limits: TraversalLimits,
): TraversalEnvelope {
  const entityByPath = new Map(
    extract.entities.map((entity) => [normalizePath(entity.path), entity]),
  );
  const pathById = new Map(
    extract.entities.map((entity) => [entity.id, normalizePath(entity.path)]),
  );
  const incoming = new Map<number, TraversalEdge[]>();
  for (const relationship of extract.relationships) {
    const edges = incoming.get(relationship.destination_id) ?? [];
    edges.push({
      relationshipId: relationship.id,
      sourceId: relationship.source_id,
    });
    incoming.set(relationship.destination_id, edges);
  }
  for (const edges of incoming.values()) {
    edges.sort(
      (left, right) =>
        left.sourceId - right.sourceId ||
        left.relationshipId - right.relationshipId,
    );
  }

  const expectedPaths: string[][] = [];
  const details = new Set<string>();

  for (const changedPath of changedPaths.map(normalizePath)) {
    const source = entityByPath.get(changedPath);
    if (!source) continue;

    let sourcePathCount = 0;
    const queue: TraversalState[] = [
      { nodeIds: [source.id], paths: [source.path], depth: 0 },
    ];
    let cursor = 0;
    while (cursor < queue.length) {
      const state = queue[cursor++]!;
      const candidates = incoming.get(state.nodeIds[state.nodeIds.length - 1]!) ?? [];
      if (state.depth >= limits.maxLen) {
        if (candidates.some((edge) => !state.nodeIds.includes(edge.sourceId))) {
          details.add(
            `maxLen ${limits.maxLen} can truncate reverse dependencies from ${changedPath}`,
          );
        }
        continue;
      }

      for (const edge of candidates) {
        if (state.nodeIds.includes(edge.sourceId)) continue;
        const nextPath = pathById.get(edge.sourceId);
        if (!nextPath) continue;
        const next: TraversalState = {
          nodeIds: [...state.nodeIds, edge.sourceId],
          paths: [...state.paths, nextPath],
          depth: state.depth + 1,
        };
        expectedPaths.push(next.paths);
        sourcePathCount += 1;
        if (sourcePathCount > limits.pathCount) {
          details.add(
            `pathCount ${limits.pathCount} can truncate reverse dependencies from ${changedPath}`,
          );
        }
        if (expectedPaths.length > limits.resultLimit) {
          details.add(
            `resultLimit ${limits.resultLimit} can truncate reverse dependencies for this change`,
          );
        }
        if (
          sourcePathCount > limits.pathCount ||
          expectedPaths.length > limits.resultLimit
        ) {
          return {
            limitExceeded: true,
            details: [...details],
            expectedPaths,
          };
        }
        queue.push(next);
      }
    }
  }

  return {
    limitExceeded: details.size > 0,
    details: [...details],
    expectedPaths,
  };
}

export function compareReturnedTraversal(
  expectedPaths: readonly string[][],
  returnedPaths: readonly GraphPath[],
): { match: boolean; detail: string } {
  const expected = expectedPaths.map(pathSignature).sort();
  const returned = returnedPaths
    .map((path) =>
      pathSignature(
        path.nodes.map((node) => {
          const value = node.properties.path;
          return typeof value === "string" ? normalizePath(value) : "<missing-path>";
        }),
      ),
    )
    .sort();
  const missing = multisetDifference(expected, returned);
  const unexpected = multisetDifference(returned, expected);
  const match = missing.length === 0 && unexpected.length === 0;
  return {
    match,
    detail: match
      ? `HydraDB returned all ${expected.length} extracted traversal paths`
      : `HydraDB traversal mismatch missing=${missing.length} unexpected=${unexpected.length}`,
  };
}

function pathSignature(paths: readonly string[]): string {
  return JSON.stringify(paths.map(normalizePath));
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
