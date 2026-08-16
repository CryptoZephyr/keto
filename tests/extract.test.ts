import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildGraph,
  extractImportsFromSource,
  resolveImportSpecifier,
} from "../src/extract.js";
import { compareExtractedGraph } from "../src/fixture-compare.js";
import type { ExpectedExtract } from "../src/fixture-compare.js";

const fixtureRoot = fileURLToPath(new URL("../fixtures/monorepo", import.meta.url));
const expectedExtract = JSON.parse(
  readFileSync(new URL("../fixtures/expected/extract.json", import.meta.url), "utf8"),
) as ExpectedExtract;

function readTree(root: string): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (abs: string, rel: string) => {
    for (const entry of readdirSync(abs)) {
      const childAbs = join(abs, entry);
      const childRel = rel ? `${rel}/${entry}` : entry;
      if (statSync(childAbs).isDirectory()) {
        if (entry === "node_modules") continue;
        walk(childAbs, childRel);
      } else if (/\.(?:[cm]?[jt]sx?)$/.test(entry)) {
        files[childRel] = readFileSync(childAbs, "utf8");
      }
    }
  };
  walk(root, "");
  return files;
}

describe("extract", () => {
  it("extracts the checked-in fixture into CodeEntity vertices and DEPENDS_ON edges", () => {
    const actual = buildGraph({
      repository: "keto-fixture",
      files: readTree(fixtureRoot),
      aliases: { "@lib/*": ["src/lib/*"] },
    });
    const comparison = compareExtractedGraph(actual, expectedExtract);
    expect(comparison, comparison.detail).toEqual(
      expect.objectContaining({ match: true, missing: [], unexpected: [] }),
    );
    expect(actual.relationships.every((rel) => rel.kind === "imports" || rel.kind === "tests")).toBe(
      true,
    );
    expect(actual.entities.every((entity) => entity.id >= 0)).toBe(true);
  });

  it("resolves Windows separators and path aliases without inventing edges", () => {
    const resolved = resolveImportSpecifier({
      fromFile: "src\\user.ts",
      specifier: "./auth",
      existingFiles: new Set(["src/auth.ts", "src/user.ts"]),
    });
    expect(resolved).toBe("src/auth.ts");

    const alias = resolveImportSpecifier({
      fromFile: "src/aliased.ts",
      specifier: "@lib/helper",
      existingFiles: new Set(["src/aliased.ts", "src/lib/helper.ts"]),
      aliases: { "@lib/*": ["src/lib/*"] },
    });
    expect(alias).toBe("src/lib/helper.ts");
  });

  it("records cycles as ordinary edges", () => {
    const graph = buildGraph({
      repository: "cycle",
      files: {
        "src/cycle-a.ts": 'import { fromB } from "./cycle-b";\nexport const fromA = fromB;\n',
        "src/cycle-b.ts": 'import { fromA } from "./cycle-a";\nexport const fromB = fromA;\n',
      },
    });
    const keys = graph.relationships.map((rel) => `${rel.source_path}->${rel.destination_path}`);
    expect(keys).toContain("src/cycle-a.ts->src/cycle-b.ts");
    expect(keys).toContain("src/cycle-b.ts->src/cycle-a.ts");
  });

  it("treats missing local imports as coverage warnings, not silent edges", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./cases/missing-file/user.ts", import.meta.url)),
      "utf8",
    );
    const graph = buildGraph({
      repository: "missing",
      files: { "src/user.ts": source },
    });
    expect(graph.relationships).toEqual([]);
    expect(graph.warnings.some((warning) => warning.type === "unresolved")).toBe(true);
  });

  it("records parse errors as coverage warnings", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./cases/parse-error/broken.ts", import.meta.url)),
      "utf8",
    );
    const parsed = extractImportsFromSource(source, "src/broken.ts");
    const graph = buildGraph({
      repository: "broken",
      files: { "src/broken.ts": source },
    });
    expect(parsed.parseErrors.length + graph.warnings.length).toBeGreaterThan(0);
    expect(graph.warnings.some((warning) => warning.type === "parse_error")).toBe(true);
  });

  it("does not create edges for dynamic imports", () => {
    const graph = buildGraph({
      repository: "dyn",
      files: {
        "src/dynamic.ts": 'export async function load(name: string) { return import(`./${name}.js`); }\n',
        "src/target.ts": "export const n = 1;\n",
      },
    });
    expect(graph.relationships).toEqual([]);
    expect(graph.warnings.some((warning) => warning.type === "dynamic_import")).toBe(true);
  });
});
