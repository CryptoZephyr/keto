import { describe, expect, it } from "vitest";
import { buildGraph } from "../src/extract.js";
import {
  analyzeTraversalEnvelope,
  compareReturnedTraversal,
} from "../src/graph-safety.js";
import type { GraphPath } from "../src/types.js";

describe("HydraDB traversal safety envelope", () => {
  it("fails closed when a nearby test is returned but another test is beyond the depth frontier", () => {
    const graph = buildGraph({
      repository: "depth-frontier",
      files: {
        "src/core.ts": "export const core = 1;\n",
        "src/core.test.ts": 'import { core } from "./core";\nexport const nearby = core;\n',
        "src/level1.ts": 'import { core } from "./core";\nexport const one = core;\n',
        "src/level2.ts": 'import { one } from "./level1";\nexport const two = one;\n',
        "src/level3.ts": 'import { two } from "./level2";\nexport const three = two;\n',
        "src/level4.ts": 'import { three } from "./level3";\nexport const four = three;\n',
        "src/deep.test.ts": 'import { four } from "./level4";\nexport const deep = four;\n',
      },
    });

    const validation = analyzeTraversalEnvelope(graph, ["src/core.ts"], {
      maxLen: 4,
      pathCount: 20,
      resultLimit: 500,
    });

    expect(validation.expectedPaths).toContainEqual([
      "src/core.ts",
      "src/core.test.ts",
    ]);
    expect(validation.limitExceeded).toBe(true);
    expect(validation.details.join(" ")).toMatch(/maxLen.*4/i);
  });

  it("detects pathCount and resultLimit truncation before selected mode", () => {
    const fanoutFiles: Record<string, string> = {
      "src/core.ts": "export const core = 1;\n",
    };
    for (let index = 0; index < 21; index += 1) {
      fanoutFiles[`src/importer-${index}.ts`] =
        'import { core } from "./core";\nexport const value = core;\n';
    }
    const fanout = buildGraph({ repository: "path-count", files: fanoutFiles });
    expect(
      analyzeTraversalEnvelope(fanout, ["src/core.ts"], {
        maxLen: 4,
        pathCount: 20,
        resultLimit: 500,
      }),
    ).toEqual(expect.objectContaining({ limitExceeded: true }));

    const manySources: Record<string, string> = {};
    const changed: string[] = [];
    for (let source = 0; source < 26; source += 1) {
      const sourcePath = `src/source-${source}.ts`;
      changed.push(sourcePath);
      manySources[sourcePath] = `export const source${source} = ${source};\n`;
      for (let importer = 0; importer < 20; importer += 1) {
        manySources[`src/s${source}-importer-${importer}.ts`] =
          `import { source${source} } from "./source-${source}";\n` +
          `export const value${source}_${importer} = source${source};\n`;
      }
    }
    const resultLimited = buildGraph({
      repository: "result-limit",
      files: manySources,
    });
    const validation = analyzeTraversalEnvelope(resultLimited, changed, {
      maxLen: 4,
      pathCount: 20,
      resultLimit: 500,
    });
    expect(validation.limitExceeded).toBe(true);
    expect(validation.details.join(" ")).toMatch(/resultLimit.*500/i);
  });

  it("rejects HydraDB path evidence that omits an extracted path", () => {
    const graph = buildGraph({
      repository: "path-proof",
      files: {
        "src/core.ts": "export const core = 1;\n",
        "src/core.test.ts": 'import { core } from "./core";\nexport const value = core;\n',
      },
    });
    const expected = analyzeTraversalEnvelope(graph, ["src/core.ts"], {
      maxLen: 4,
      pathCount: 20,
      resultLimit: 500,
    });
    const missing: GraphPath[] = [];
    expect(compareReturnedTraversal(expected.expectedPaths, missing)).toEqual(
      expect.objectContaining({ match: false }),
    );
  });
});
