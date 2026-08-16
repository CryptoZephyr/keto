import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { buildGraph } from "../src/extract.js";
import { explainChange } from "../src/explain.js";
import type { GraphSnapshot } from "../src/ingest.js";
import type { GraphPath } from "../src/types.js";

const boltRun = vi.hoisted(() => vi.fn());

vi.mock("../src/hydra/bolt.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/hydra/bolt.js")>();
  return {
    ...actual,
    boltRun,
    withBoltSession: async <T>(
      _config: unknown,
      fn: (session: unknown) => Promise<T>,
    ): Promise<T> => fn({}),
  };
});

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("explain graph freshness gate", () => {
  it("allows selected mode only for current snapshots and complete HydraDB paths", async () => {
    const files = {
      "src/core.ts": "export const core = 1;\n",
      "src/core.test.ts":
        'import { core } from "./core";\nexport const tested = core;\n',
    };
    const repoRoot = await makeRepository(files);
    const extract = buildGraph({ repository: "freshness", files });
    const snapshot = snapshotFor(extract);
    const paths: GraphPath[] = [
      {
        nodes: [
          { properties: { path: "src/core.ts", kind: "file" } },
          { properties: { path: "src/core.test.ts", kind: "test" } },
        ],
      },
    ];
    const config = loadConfig({
      repository: "freshness",
      boltUrl: "bolt://127.0.0.1:1",
    });
    let currentSnapshot = snapshot;
    boltRun.mockImplementation(async (_session, query: string) => {
      if (query.includes("MATCH (n:CodeEntity)")) {
        return { records: currentSnapshot.vertices };
      }
      if (query.includes("MATCH (source:CodeEntity)-[:DEPENDS_ON]")) {
        return {
          records: currentSnapshot.relationships.map((relationship) => ({
            source_id: relationship.source_id,
            destination_id: relationship.destination_id,
            source_key: "source",
            dest_key: "destination",
          })),
        };
      }
      if (query.includes("algo.MSpaths")) {
        return { records: paths.map((path) => ({ path })) };
      }
      throw new Error(`unexpected query: ${query}`);
    });

    const fresh = await explainChange({
      repoRoot,
      changed: ["src/core.ts"],
      config,
    });
    expect(fresh.mode).toBe("selected");
    expect(fresh.selectedTests).toEqual(["src/core.test.ts"]);

    const stale = structuredClone(snapshot);
    stale.vertices.find((vertex) => vertex.path === "src/core.ts")!.content_hash =
      "old-content-hash";
    currentSnapshot = stale;
    const rejected = await explainChange({
      repoRoot,
      changed: ["src/core.ts"],
      config,
    });
    expect(rejected.mode).toBe("full_suite");
    expect(rejected.reasons).toContainEqual(
      expect.objectContaining({ code: "incomplete_coverage" }),
    );
  });
});

async function makeRepository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "keto-explain-"));
  tempRoots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    const absolute = join(root, ...path.split("/"));
    await mkdir(join(absolute, ".."), { recursive: true });
    await writeFile(absolute, contents, "utf8");
  }
  return root;
}

function snapshotFor(extract: ReturnType<typeof buildGraph>): GraphSnapshot {
  return {
    vertices: extract.entities.map((entity) => ({
      ...entity,
      identity_version: extract.identity_version,
    })),
    relationships: extract.relationships.map((relationship) => ({
      id: relationship.id,
      stable_key: relationship.stable_key,
      kind: relationship.kind,
      source_id: relationship.source_id,
      destination_id: relationship.destination_id,
    })),
  };
}
