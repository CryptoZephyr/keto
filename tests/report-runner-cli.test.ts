import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("report runner CLI", () => {
  it("executes the selected report and passes a metacharacter path literally", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "keto-report-runner-"));
    tempRoots.push(repoRoot);
    const reportPath = join(repoRoot, "keto-agent.json");
    await writeFile(
      join(repoRoot, "package.json"),
      JSON.stringify({ scripts: { test: "node test-probe.mjs" } }),
      "utf8",
    );
    await writeFile(
      join(repoRoot, "test-probe.mjs"),
      'import { writeFileSync } from "node:fs";\nwriteFileSync("probe.json", JSON.stringify(process.argv.slice(2)));\n',
      "utf8",
    );
    await writeFile(
      reportPath,
      JSON.stringify({
        mode: "selected",
        selectedTests: ["tests/a&b.test.ts"],
      }),
      "utf8",
    );

    const runnerPath = resolve("scripts/run-keto-report.mjs");
    const result = await execFileAsync(
      process.execPath,
      [runnerPath, reportPath, repoRoot],
      { cwd: resolve("."), windowsHide: true, timeout: 15_000 },
    );

    expect(result.stdout).toContain("Keto report test mode=selected");
    expect(JSON.parse(await readFile(join(repoRoot, "probe.json"), "utf8"))).toEqual([
      "tests/a&b.test.ts",
    ]);
  });
});
