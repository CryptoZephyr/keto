import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  new URL("../.github/workflows/keto.yml", import.meta.url),
  "utf8",
);

describe("GitHub Action", () => {
  it("exists and fails closed without printing the HydraDB token", () => {
    expect(workflow).toContain("keto-agent.json");
    expect(workflow).toContain("Failing closed into the fixture full suite");
    expect(workflow).toContain("secrets.HYDRADB_AUTH_TOKEN");
    expect(workflow).not.toMatch(/echo\s+.*HYDRADB_AUTH_TOKEN/);
    expect(workflow).not.toMatch(/::add-mask::\$\{\{\s*secrets\.HYDRADB_AUTH_TOKEN/);
    expect(workflow).not.toContain("printenv");
  });
});
