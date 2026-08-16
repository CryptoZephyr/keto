import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { join } from "node:path";

export interface TestRunResult {
  command: string[];
  exitCode: number;
}

export async function detectTestRunner(
  repoRoot: string,
): Promise<"vitest" | "jest"> {
  const names = [
    "vitest.config.ts",
    "vitest.config.js",
    "vitest.config.mts",
    "jest.config.ts",
    "jest.config.js",
    "jest.config.cjs",
    "jest.config.mjs",
  ];
  for (const name of names) {
    try {
      await access(join(repoRoot, name));
      return name.startsWith("jest") ? "jest" : "vitest";
    } catch {
      // try next
    }
  }
  return "vitest";
}

export async function runTests(
  repoRoot: string,
  tests: string[] | "full",
): Promise<TestRunResult> {
  const runner = await detectTestRunner(repoRoot);
  const command =
    runner === "jest"
      ? tests === "full"
        ? ["npx", "jest", "--ci"]
        : ["npx", "jest", "--ci", ...tests]
      : tests === "full"
        ? ["npx", "vitest", "run"]
        : ["npx", "vitest", "run", ...tests];
  const exitCode = await spawnCommand(command, repoRoot);
  return { command, exitCode };
}

function spawnCommand(command: string[], cwd: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command[0]!, command.slice(1), {
      cwd,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
}
