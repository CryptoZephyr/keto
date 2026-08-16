import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const startScript = readFileSync(
  new URL("../scripts/start-hydradb.sh", import.meta.url),
  "utf8",
);
const gitignore = readFileSync(new URL("../.gitignore", import.meta.url), "utf8");
const envExample = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

describe("HydraDB setup guardrails in shipped files", () => {
  it("pins HydraDB 0.1.1 and binds Bolt/HTTP/admin to loopback only", () => {
    expect(startScript).toContain("ghcr.io/hydra-db/hydradb:0.1.1");
    expect(startScript).toContain("-p 127.0.0.1:7687:7687");
    expect(startScript).toContain("-p 127.0.0.1:8443:8443");
    expect(startScript).toContain("-p 127.0.0.1:9090:9090");
    expect(startScript).not.toMatch(/-p\s+7687:7687/);
    expect(startScript).not.toContain(":latest");
  });

  it("keeps secrets and HydraDB data out of git", () => {
    expect(gitignore).toMatch(/^\.env$/m);
    expect(gitignore).toMatch(/^\.hydradb\/$/m);
    expect(gitignore).toMatch(/^node_modules\/$/m);
    expect(gitignore).toMatch(/^dist\/$/m);
    expect(gitignore).toMatch(/^coverage\/$/m);
    expect(envExample).toContain("HYDRADB_AUTH_TOKEN=local-development-token-32-bytes");
    expect(envExample).not.toMatch(/ghp_|github_pat_|sk-live/);
  });

  it("documents HydraDB usage and what is lost without it", () => {
    expect(readme).toContain("Where HydraDB is used");
    expect(readme).toContain("What Keto loses without HydraDB");
    expect(readme).toContain("algo.MSpaths");
    expect(readme).toContain("fails closed");
  });
});
