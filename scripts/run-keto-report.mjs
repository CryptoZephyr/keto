#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, posix, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FULL_SUITE = Object.freeze({
  mode: "full_suite",
  command: ["npm", "test"],
});

export function testPlanFromReport(report) {
  if (!report || typeof report !== "object" || report.mode !== "selected") {
    return { ...FULL_SUITE, reason: "report did not prove selected mode" };
  }
  if (!Array.isArray(report.selectedTests) || report.selectedTests.length === 0) {
    return { ...FULL_SUITE, reason: "selected report has no tests" };
  }

  const tests = [];
  for (const rawPath of report.selectedTests) {
    if (typeof rawPath !== "string" || !isSafeTestPath(rawPath)) {
      return { ...FULL_SUITE, reason: "selected report contains an unsafe test path" };
    }
    const normalized = posix.normalize(rawPath.replaceAll("\\", "/"));
    if (!tests.includes(normalized)) tests.push(normalized);
  }
  return {
    mode: "selected",
    command: ["npm", "test", "--", ...tests],
  };
}

function isSafeTestPath(rawPath) {
  if (
    rawPath.length === 0 ||
    rawPath.startsWith("-") ||
    /[\u0000-\u001f\u007f]/.test(rawPath) ||
    isAbsolute(rawPath) ||
    /^[A-Za-z]:/.test(rawPath)
  ) {
    return false;
  }
  const normalized = posix.normalize(rawPath.replaceAll("\\", "/"));
  return (
    normalized !== ".." &&
    !normalized.startsWith("../") &&
    normalized !== "." &&
    !normalized.startsWith("/")
  );
}

async function main() {
  const reportPath = resolve(process.argv[2] ?? "keto-agent.json");
  const repoRoot = resolve(process.argv[3] ?? ".");
  let report;
  try {
    report = JSON.parse(await readFile(reportPath, "utf8"));
  } catch (error) {
    process.stderr.write(
      `Keto report unavailable; running full suite: ${error instanceof Error ? error.message : String(error)}\n`,
    );
  }
  const plan = testPlanFromReport(report);
  process.stdout.write(`Keto report test mode=${plan.mode}\n`);
  if (plan.reason) process.stdout.write(`Reason: ${plan.reason}\n`);
  const exitCode = await run(plan.command, repoRoot);
  process.exitCode = exitCode;
}

function run(command, cwd) {
  return new Promise((resolveExit, reject) => {
    const [executable, args] = shellFreeCommand(command);
    const child = spawn(executable, args, {
      cwd,
      stdio: "inherit",
      shell: false,
    });
    child.once("error", reject);
    child.once("exit", (code) => resolveExit(code ?? 1));
  });
}

function shellFreeCommand(command) {
  if (process.platform !== "win32" || command[0] !== "npm") {
    return [command[0], command.slice(1)];
  }

  const candidates = [
    process.env.npm_execpath,
    join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
  ];
  const npmCli = candidates.find(
    (candidate) => typeof candidate === "string" && existsSync(candidate),
  );
  if (!npmCli) {
    throw new Error("Cannot locate npm-cli.js for shell-free test execution");
  }
  return [process.execPath, [npmCli, ...command.slice(1)]];
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
