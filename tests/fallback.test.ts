import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decideFallback } from "../src/fallback.js";
import type { FallbackInput } from "../src/fallback.js";
import type { FallbackReason } from "../src/types.js";

interface FallbackCase {
  id: string;
  input: FallbackInput;
  expectedMode: "selected" | "full_suite";
  expectedCode: FallbackReason | null;
}

const catalog = JSON.parse(
  readFileSync(new URL("../fixtures/expected/fallback-cases.json", import.meta.url), "utf8"),
) as { cases: FallbackCase[] };

describe("fallback decision table", () => {
  it("fails closed when an importer warning can hide a dependency on another changed file", () => {
    const decision = decideFallback({
      changedPaths: ["src/target.ts"],
      indexedPaths: ["src/importer.ts", "src/target.ts", "src/target.test.ts"],
      coverageWarnings: [
        {
          type: "dynamic_import",
          path: "src/importer.ts",
          detail: "dynamic import() with a non-literal specifier",
        },
      ],
      selectedTests: ["src/target.test.ts"],
    });

    expect(decision.mode).toBe("full_suite");
    expect(decision.tests).toEqual([]);
    expect(decision.reasons).toContainEqual(
      expect.objectContaining({ code: "dynamic_import" }),
    );
  });

  it("fails closed when the current extract cannot be proven against the HydraDB snapshot", () => {
    const decision = decideFallback({
      changedPaths: ["src/target.ts"],
      indexedPaths: ["src/target.ts", "src/target.test.ts"],
      coverageWarnings: [],
      selectedTests: ["src/target.test.ts"],
      incompleteCoverage:
        "HydraDB graph does not match the current content hashes and topology",
    });

    expect(decision.mode).toBe("full_suite");
    expect(decision.reasons).toContainEqual(
      expect.objectContaining({ code: "incomplete_coverage" }),
    );
  });

  it("covers every checked-in fail-closed case", () => {
    const ids = catalog.cases.map((item) => item.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "changed_path_absent",
        "parse_error",
        "unresolved_import",
        "dynamic_import",
        "root_config",
        "lockfile",
        "test_config",
        "shared_tooling",
        "hydradb_unavailable",
        "hydradb_timeout",
        "hydradb_rejected",
        "hydradb_budget",
        "fixture_mismatch",
        "empty_result_nontrivial",
        "missing_file",
        "query_limit",
      ]),
    );
  });

  for (const fixtureCase of catalog.cases) {
    it(`${fixtureCase.id} → ${fixtureCase.expectedMode}`, () => {
      const decision = decideFallback(fixtureCase.input);
      expect(decision.mode).toBe(fixtureCase.expectedMode);
      if (fixtureCase.expectedCode) {
        expect(decision.reasons.some((reason) => reason.code === fixtureCase.expectedCode)).toBe(
          true,
        );
        expect(decision.tests).toEqual([]);
      } else {
        expect(decision.mode).toBe("selected");
        expect(decision.tests).toEqual(
          fixtureCase.input.selectedTests.map((path) => path.replace(/\\/g, "/")),
        );
      }
    });
  }
});
