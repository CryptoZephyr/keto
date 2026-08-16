import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { buildGraph } from "../src/extract.js";

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

const {
  DELETE_VERTICES,
  READ_VERTEX_IDS,
  UPSERT_VERTICES,
  ingestExtract,
} = await import("../src/ingest.js");

describe("graph replacement ingestion", () => {
  beforeEach(() => {
    boltRun.mockReset();
  });

  it("deletes existing vertices through Bolt before upsert with a fresh idempotency scope", async () => {
    const graph = buildGraph({
      repository: "replacement",
      files: {
        "src/core.ts": "export const core = 1;\n",
        "src/core.test.ts":
          'import { core } from "./core";\nexport const tested = core;\n',
      },
    });
    const config = loadConfig({ repository: graph.repository });
    boltRun.mockImplementation(async (_session, query: string) => {
      if (query === READ_VERTEX_IDS) {
        return { records: [{ id: 101 }, { id: 202 }], bookmark: undefined };
      }
      return { records: [], bookmark: undefined };
    });

    const first = await ingestExtract(config, graph);
    await ingestExtract(config, graph);

    const deleteCalls = boltRun.mock.calls.filter((call) => call[1] === DELETE_VERTICES);
    expect(first.deletedVertices).toBe(2);
    expect(first.deletedVertexBatches).toBe(1);
    expect(deleteCalls).toHaveLength(2);
    expect(deleteCalls[0]?.[2]).toEqual({ rows: [{ vertex: 101 }, { vertex: 202 }] });
    expect(deleteCalls[1]?.[2]).toEqual({ rows: [{ vertex: 101 }, { vertex: 202 }] });
    expect(deleteCalls[0]?.[4]).not.toBe(deleteCalls[1]?.[4]);
    expect(
      boltRun.mock.calls.findIndex((call) => call[1] === DELETE_VERTICES),
    ).toBeLessThan(
      boltRun.mock.calls.findIndex((call) => call[1] === UPSERT_VERTICES),
    );
  });

  it("keeps deletion bounded and skips it for an empty graph", async () => {
    const graph = buildGraph({
      repository: "bounded-replacement",
      files: { "src/core.ts": "export const core = 1;\n" },
    });
    const config = loadConfig({ repository: graph.repository });
    boltRun.mockImplementation(async (_session, query: string) => {
      if (query === READ_VERTEX_IDS) {
        return {
          records: Array.from({ length: 33 }, (_, id) => ({ id })),
          bookmark: undefined,
        };
      }
      return { records: [], bookmark: undefined };
    });

    const result = await ingestExtract(config, graph);
    const deleteCalls = boltRun.mock.calls.filter((call) => call[1] === DELETE_VERTICES);
    expect(result.deletedVertices).toBe(33);
    expect(result.deletedVertexBatches).toBe(2);
    expect(deleteCalls[0]?.[2].rows).toHaveLength(32);
    expect(deleteCalls[1]?.[2].rows).toHaveLength(1);

    boltRun.mockReset();
    boltRun.mockResolvedValue({ records: [], bookmark: undefined });
    const empty = await ingestExtract(config, graph);
    expect(empty.deletedVertices).toBe(0);
    expect(empty.deletedVertexBatches).toBe(0);
    expect(boltRun.mock.calls.some((call) => call[1] === DELETE_VERTICES)).toBe(false);
  });

  it("stops before upsert when deletion fails", async () => {
    const graph = buildGraph({
      repository: "failed-replacement",
      files: { "src/core.ts": "export const core = 1;\n" },
    });
    const config = loadConfig({ repository: graph.repository });
    boltRun.mockImplementation(async (_session, query: string) => {
      if (query === READ_VERTEX_IDS) return { records: [{ id: 303 }], bookmark: undefined };
      if (query === DELETE_VERTICES) throw new Error("delete failed");
      return { records: [], bookmark: undefined };
    });

    await expect(ingestExtract(config, graph)).rejects.toThrow("delete failed");
    expect(boltRun.mock.calls.some((call) => call[1] === UPSERT_VERTICES)).toBe(false);
  });

  it("stops before upsert when a later deletion batch fails", async () => {
    const graph = buildGraph({
      repository: "partially-deleted-replacement",
      files: { "src/core.ts": "export const core = 1;\n" },
    });
    const config = loadConfig({ repository: graph.repository });
    let deletionAttempt = 0;
    boltRun.mockImplementation(async (_session, query: string) => {
      if (query === READ_VERTEX_IDS) {
        return {
          records: Array.from({ length: 33 }, (_, id) => ({ id })),
          bookmark: undefined,
        };
      }
      if (query === DELETE_VERTICES) {
        deletionAttempt += 1;
        if (deletionAttempt === 2) throw new Error("second delete batch failed");
      }
      return { records: [], bookmark: undefined };
    });

    await expect(ingestExtract(config, graph)).rejects.toThrow(
      "second delete batch failed",
    );
    const deleteCalls = boltRun.mock.calls.filter((call) => call[1] === DELETE_VERTICES);
    expect(deleteCalls).toHaveLength(2);
    expect(deleteCalls[0]?.[2].rows).toHaveLength(32);
    expect(deleteCalls[1]?.[2].rows).toHaveLength(1);
    expect(deleteCalls[0]?.[4]).not.toBe(deleteCalls[1]?.[4]);
    expect(boltRun.mock.calls.some((call) => call[1] === UPSERT_VERTICES)).toBe(false);
  });
});
