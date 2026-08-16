import { resolve } from "node:path";
import { loadConfig, maybeLoadDotEnv } from "./config.js";
import { extractRepository } from "./extract.js";
import { explainChange, formatExplainHuman } from "./explain.js";
import { compareSnapshotToExtract, ingestExtract, readBackGraph } from "./ingest.js";
import { formatTestHuman, runTestCommand } from "./test-command.js";

interface CliArgs {
  command: string;
  repo: string;
  base?: string;
  json: boolean;
  dryRun: boolean;
  changed: string[];
  repository?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const [command = "help", ...rest] = argv;
  const args: CliArgs = {
    command,
    repo: ".",
    json: false,
    dryRun: false,
    changed: [],
  };
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i]!;
    const next = rest[i + 1];
    if (token === "--repo" && next) {
      args.repo = next;
      i += 1;
    } else if (token === "--base" && next) {
      args.base = next;
      i += 1;
    } else if (token === "--repository" && next) {
      args.repository = next;
      i += 1;
    } else if (token === "--changed" && next) {
      args.changed.push(next);
      i += 1;
    } else if (token === "--json") {
      args.json = true;
    } else if (token === "--dry-run") {
      args.dryRun = true;
    } else if (token === "--help" || token === "-h") {
      args.command = "help";
    }
  }
  return args;
}

function printHelp(): void {
  process.stdout.write(`Keto — graph-native PR impact and safe test routing

Usage:
  keto index --repo <path>
  keto explain --repo <path> --base <git-ref> [--json] [--changed <file>]
  keto test --repo <path> --base <git-ref> [--dry-run] [--json] [--changed <file>]

HydraDB is required for index/explain/test. Without it, keto test fails closed
into the full suite and prints why.
`);
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = resolve(args.repo);
  await maybeLoadDotEnv(process.cwd());
  const config = loadConfig({ repository: args.repository });

  if (args.command === "help" || args.command === "--help") {
    printHelp();
    return 0;
  }

  if (args.command === "extract") {
    const extracted = await extractRepository(
      repoRoot,
      args.repository ?? config.repository,
    );
    process.stdout.write(
      JSON.stringify(
        {
          repository: extracted.repository,
          vertices: extracted.entities.length,
          relationships: extracted.relationships.length,
          warnings: extracted.warnings.length,
          extract: extracted,
        },
        null,
        2,
      ) + "\n",
    );
    return 0;
  }

  if (args.command === "index") {
    const extracted = await extractRepository(
      repoRoot,
      args.repository ?? config.repository,
    );
    process.stdout.write(
      `Extracted vertices=${extracted.entities.length} relationships=${extracted.relationships.length} warnings=${extracted.warnings.length}\n`,
    );
    try {
      const ingested = await ingestExtract(config, extracted);
      const comparison = compareSnapshotToExtract(ingested.snapshot, extracted);
      process.stdout.write(
        `Ingested vertices=${ingested.vertices} relationships=${ingested.relationships} vertexBatches=${ingested.vertexBatches} relationshipBatches=${ingested.relationshipBatches}\n`,
      );
      process.stdout.write(`${comparison.detail}\n`);
      if (!comparison.match) {
        process.stderr.write("Index read-back did not match extractor output\n");
        return 2;
      }
      return 0;
    } catch (error) {
      process.stderr.write(formatError(error) + "\n");
      return 1;
    }
  }

  if (args.command === "explain") {
    if (!args.base && args.changed.length === 0) {
      process.stderr.write("keto explain requires --base <git-ref> or --changed <file>\n");
      return 2;
    }
    const result = await explainChange({
      repoRoot,
      gitRoot: process.cwd(),
      baseRef: args.base,
      changed: args.changed.length > 0 ? args.changed : undefined,
      repository: args.repository ?? config.repository,
      config,
    });
    if (args.json) {
      process.stdout.write(`${JSON.stringify(publicExplain(result), null, 2)}\n`);
    } else {
      process.stdout.write(`${formatExplainHuman(result)}\n`);
    }
    return 0;
  }

  if (args.command === "test") {
    if (!args.base && args.changed.length === 0) {
      process.stderr.write("keto test requires --base <git-ref> or --changed <file>\n");
      return 2;
    }
    const result = await runTestCommand({
      repoRoot,
      gitRoot: process.cwd(),
      baseRef: args.base,
      changed: args.changed.length > 0 ? args.changed : undefined,
      repository: args.repository ?? config.repository,
      config,
      dryRun: args.dryRun,
    });
    if (args.json) {
      process.stdout.write(`${JSON.stringify(publicTest(result), null, 2)}\n`);
    } else {
      process.stdout.write(`${formatTestHuman(result)}\n`);
    }
    return result.exitCode ?? 0;
  }

  if (args.command === "readback") {
    const extracted = await extractRepository(
      repoRoot,
      args.repository ?? config.repository,
    );
    const snapshot = await readBackGraph(config);
    const comparison = compareSnapshotToExtract(snapshot, extracted);
    process.stdout.write(`${JSON.stringify({ snapshot, comparison }, null, 2)}\n`);
    return comparison.match ? 0 : 2;
  }

  printHelp();
  return 2;
}

function publicExplain(result: Awaited<ReturnType<typeof explainChange>>) {
  return {
    mode: result.mode,
    reasons: result.reasons,
    changed: result.changed,
    affectedFiles: result.affectedFiles,
    affectedTests: result.affectedTests,
    selectedTests: result.selectedTests,
    query: result.query,
    bookmark: result.bookmark,
    vertices: result.extract.entities.length,
    relationships: result.extract.relationships.length,
  };
}

function publicTest(result: Awaited<ReturnType<typeof runTestCommand>>) {
  return {
    ...publicExplain(result.explain),
    dryRun: result.dryRun,
    executed: result.executed,
    command: result.command,
    exitCode: result.exitCode,
  };
}

function formatError(error: unknown): string {
  if (error && typeof error === "object" && "kind" in error && "message" in error) {
    return `HydraDB ${(error as { kind: string }).kind}: ${(error as { message: string }).message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

main()
  .then((code) => {
    process.exit(code);
  })
  .catch((error) => {
    process.stderr.write(`${formatError(error)}\n`);
    process.exit(1);
  });
