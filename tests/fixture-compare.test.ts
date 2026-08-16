import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  compareImpact,
  findImpactCase,
  recallIsComplete,
} from "../src/fixture-compare.js";
import { extractTestsFromPaths } from "../src/impact.js";
import type { GraphPath } from "../src/types.js";

const fixture = JSON.parse(
  readFileSync(new URL("../fixtures/monorepo/keto.fixture.json", import.meta.url), "utf8"),
) as {
  cases: Array<{
    id: string;
    changed: string[];
    affected_tests?: string[];
    must_not_select?: string[];
    fallback?: string;
  }>;
};

function loadPaths(name: string): GraphPath[] {
  return JSON.parse(
    readFileSync(new URL(`../fixtures/expected/${name}`, import.meta.url), "utf8"),
  ) as GraphPath[];
}

describe("fixture compare and impact path reading", () => {
  it("selects the fixture's direct, two-hop, four-hop, and cycle tests from recorded paths", () => {
    const mapping: Record<string, string> = {
      direct: "paths-direct.json",
      "two-hop": "paths-two-hop.json",
      "four-hop": "paths-four-hop.json",
      cycle: "paths-cycle.json",
    };
    for (const [id, file] of Object.entries(mapping)) {
      const expected = findImpactCase(fixture.cases, fixture.cases.find((item) => item.id === id)!.changed);
      expect(expected?.affected_tests, id).toBeTruthy();
      const tests = extractTestsFromPaths(loadPaths(file));
      const comparison = compareImpact(
        tests.map((item) => item.path),
        expected!.affected_tests!,
      );
      expect(recallIsComplete(comparison), comparison.detail).toBe(true);
      expect(tests.every((item) => item.paths.length > 0)).toBe(true);
      if (expected?.must_not_select) {
        for (const forbidden of expected.must_not_select) {
          expect(tests.map((item) => item.path)).not.toContain(forbidden);
        }
      }
    }
  });

  it("does not emit a selected-test result when recall is incomplete", () => {
    const comparison = compareImpact(["src/wrong.test.ts"], ["src/util.test.ts"]);
    expect(recallIsComplete(comparison)).toBe(false);
  });
});
