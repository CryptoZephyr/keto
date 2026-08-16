import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { buildGraph } from "../src/extract.js";

const httpQuery = vi.hoisted(() => vi.fn().mockResolvedValue({ rows: [] }));
const boltRun = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ records: [], bookmark: undefined }),
);

vi.mock("../src/hydra/http.js", () => ({ httpQuery }));
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

const { ingestExtract } = await import("../src/ingest.js");

describe("graph replacement ingestion", () => {
  it("uses a new idempotency scope for every replacement run", async () => {
    const graph = buildGraph({
      repository: "replacement",
      files: {
        "src/core.ts": "export const core = 1;\n",
        "src/core.test.ts":
          'import { core } from "./core";\nexport const tested = core;\n',
      },
    });
    const config = loadConfig({ repository: graph.repository });

    await ingestExtract(config, graph);
    await ingestExtract(config, graph);

    expect(httpQuery).toHaveBeenCalledTimes(2);
    expect(httpQuery.mock.calls[0]?.[2]).not.toBe(httpQuery.mock.calls[1]?.[2]);

    const mutationKeys = boltRun.mock.calls
      .map((call) => call[4])
      .filter((key): key is string => typeof key === "string");
    expect(mutationKeys).toHaveLength(4);
    expect(new Set(mutationKeys).size).toBe(4);
  });
});
