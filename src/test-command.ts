import { loadConfig } from "./config.js";
import { explainChange, type ExplainRequest, type ExplainResult } from "./explain.js";
import { runTests } from "./test-runner.js";

export interface TestCommandRequest extends ExplainRequest {
  dryRun?: boolean;
}

export interface TestCommandResult {
  explain: ExplainResult;
  dryRun: boolean;
  executed: "selected" | "full_suite" | "none";
  command?: string[];
  exitCode?: number;
}

export async function runTestCommand(
  request: TestCommandRequest,
): Promise<TestCommandResult> {
  const config = request.config ?? loadConfig({ repository: request.repository });
  const explain = await explainChange({ ...request, config });
  if (request.dryRun) {
    return {
      explain,
      dryRun: true,
      executed: "none",
    };
  }
  if (explain.mode === "full_suite") {
    const run = await runTests(request.repoRoot, "full");
    return {
      explain,
      dryRun: false,
      executed: "full_suite",
      command: run.command,
      exitCode: run.exitCode,
    };
  }
  const run = await runTests(request.repoRoot, explain.selectedTests);
  return {
    explain,
    dryRun: false,
    executed: "selected",
    command: run.command,
    exitCode: run.exitCode,
  };
}

export function formatTestHuman(result: TestCommandResult): string {
  const lines: string[] = [];
  lines.push(`Keto test`);
  lines.push(`Mode: ${result.explain.mode}`);
  if (result.explain.mode === "full_suite") {
    lines.push("Why full suite:");
    for (const reason of result.explain.reasons) {
      lines.push(`  [${reason.code}] ${reason.detail}`);
    }
  } else {
    lines.push("Why selected:");
    lines.push("  graph coverage is complete and the impact query succeeded within limits");
    for (const test of result.explain.affectedTests) {
      lines.push(`  ${test.path}`);
      const evidence = test.paths[0];
      if (evidence) lines.push(`    path: ${evidence.join(" <- ")}`);
    }
  }
  if (result.dryRun) {
    if (result.explain.mode === "full_suite") {
      lines.push("Dry-run: would execute the full suite");
    } else {
      lines.push("Dry-run selected tests:");
      for (const test of result.explain.selectedTests) lines.push(`  ${test}`);
    }
  } else if (result.command) {
    lines.push(`Executed: ${result.command.join(" ")}`);
    lines.push(`Exit code: ${result.exitCode}`);
  }
  return lines.join("\n");
}
