import { isTestPath, normalizePath } from "./identity.js";
import type { GraphPath, ImpactTest, PathNode } from "./types.js";

export function nodePathProperty(node: PathNode): string | undefined {
  const value = node.properties.path ?? node.properties.stable_key;
  if (typeof value === "string" && value.length > 0) {
    if (value.includes(":") && !value.includes("/")) {
      return undefined;
    }
    if (typeof node.properties.path === "string") {
      return normalizePath(node.properties.path);
    }
  }
  if (typeof node.properties.path === "string") {
    return normalizePath(node.properties.path);
  }
  const stable = node.properties.stable_key;
  if (typeof stable === "string") {
    const parts = stable.split(":");
    if (parts.length >= 3) {
      return normalizePath(parts.slice(1, -1).join(":"));
    }
  }
  return undefined;
}

export function nodeKind(node: PathNode): string | undefined {
  const kind = node.properties.kind;
  return typeof kind === "string" ? kind : undefined;
}

export function isTestNode(node: PathNode): boolean {
  if (nodeKind(node) === "test") return true;
  const path = nodePathProperty(node);
  return path ? isTestPath(path) : false;
}

export function extractTestsFromPaths(paths: readonly GraphPath[]): ImpactTest[] {
  const byTest = new Map<string, string[][]>();
  for (const graphPath of paths) {
    const nodePaths = graphPath.nodes
      .map(nodePathProperty)
      .filter((path): path is string => Boolean(path));
    if (nodePaths.length === 0) continue;
    for (const node of graphPath.nodes) {
      if (!isTestNode(node)) continue;
      const testPath = nodePathProperty(node);
      if (!testPath) continue;
      const bucket = byTest.get(testPath) ?? [];
      bucket.push(nodePaths);
      byTest.set(testPath, bucket);
    }
  }

  return [...byTest.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, evidence]) => ({
      path,
      paths: uniquePathLists(evidence),
    }));
}

export function affectedFilesFromPaths(paths: readonly GraphPath[]): string[] {
  const files = new Set<string>();
  for (const graphPath of paths) {
    for (const node of graphPath.nodes) {
      const path = nodePathProperty(node);
      if (path) files.add(path);
    }
  }
  return [...files].sort();
}

export function hydrateHttpPath(value: unknown): GraphPath | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.type === "path" && record.value && typeof record.value === "object") {
    return hydrateHttpPath(record.value);
  }
  const nodesRaw = record.nodes;
  if (!Array.isArray(nodesRaw)) return null;
  const nodes: PathNode[] = nodesRaw.map((node) => {
    if (node && typeof node === "object") {
      const item = node as Record<string, unknown>;
      const properties =
        item.properties && typeof item.properties === "object"
          ? unwrapHttpProperties(item.properties as Record<string, unknown>)
          : unwrapHttpProperties(item);
      return {
        id: typeof item.id === "number" ? item.id : numberish(item.id),
        labels: Array.isArray(item.labels)
          ? item.labels.filter((label): label is string => typeof label === "string")
          : undefined,
        properties,
      };
    }
    return { properties: {} };
  });
  return { nodes };
}

export function unwrapHttpValue(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  if ("type" in record && "value" in record) {
    if (record.type === "path") {
      return hydrateHttpPath(record);
    }
    return record.value;
  }
  return value;
}

function unwrapHttpProperties(
  properties: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    out[key] = unwrapHttpValue(value);
  }
  return out;
}

function numberish(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && "low" in value) {
    const low = (value as { low: unknown }).low;
    return typeof low === "number" ? low : undefined;
  }
  return undefined;
}

function uniquePathLists(lists: string[][]): string[][] {
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const list of lists) {
    const key = list.join(">");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(list);
  }
  return out;
}
