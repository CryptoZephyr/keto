import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  new URL("../.github/workflows/keto.yml", import.meta.url),
  "utf8",
);

describe("GitHub Action", () => {
  it("indexes and analyzes the checkout, builds it, and executes the emitted report", () => {
    expect(workflow).toContain("bash scripts/start-hydradb.sh");
    expect(workflow).toContain("npm run build");
    expect(workflow).toContain("node bin/keto.mjs index --repo .");
    expect(workflow).toContain("node bin/keto.mjs explain --repo .");
    expect(workflow).toContain("node scripts/run-keto-report.mjs");
    expect(workflow).toContain("if not isinstance(data, dict):");
    expect(workflow).not.toContain("- name: Unit tests");
    expect(workflow).not.toContain("--repo fixtures/monorepo");
    expect(workflow).not.toContain("--changed src/util.ts");
  });

  it("fails closed without printing the HydraDB token", () => {
    expect(workflow).toContain("keto-agent.json");
    expect(workflow).not.toMatch(/echo\s+.*HYDRADB_AUTH_TOKEN/);
    expect(workflow).not.toMatch(/::add-mask::\$\{\{\s*secrets\.HYDRADB_AUTH_TOKEN/);
    expect(workflow).not.toContain("printenv");
  });

  it("uses a tested report runner that rejects invalid selected-test paths", async () => {
    const runnerUrl = new URL("../scripts/run-keto-report.mjs", import.meta.url);
    expect(existsSync(fileURLToPath(runnerUrl))).toBe(true);
    const { testPlanFromReport } = await import(runnerUrl.href);

    expect(
      testPlanFromReport({ mode: "selected", selectedTests: ["tests/fallback.test.ts"] }),
    ).toEqual({ mode: "selected", command: ["npm", "test", "--", "tests/fallback.test.ts"] });
    expect(
      testPlanFromReport({ mode: "selected", selectedTests: ["../outside.test.ts"] }),
    ).toEqual(expect.objectContaining({ mode: "full_suite", command: ["npm", "test"] }));
    for (const unsafePath of ["\\outside.test.ts", "C:outside.test.ts"]) {
      expect(testPlanFromReport({ mode: "selected", selectedTests: [unsafePath] })).toEqual(
        expect.objectContaining({ mode: "full_suite", command: ["npm", "test"] }),
      );
    }
    expect(testPlanFromReport({ mode: "full_suite", selectedTests: [] })).toEqual(
      expect.objectContaining({ mode: "full_suite", command: ["npm", "test"] }),
    );
  });
});
