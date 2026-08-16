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
