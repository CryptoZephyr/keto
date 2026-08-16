import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadConfig, type KetoConfig } from "./config.js";
import { extractRepository } from "./extract.js";
import { decideFallback } from "./fallback.js";
import {
  compareImpact,
  findImpactCase,
  type ExpectedImpactCase,
} from "./fixture-compare.js";
import { changedFilesForRepo, normalizeChanged } from "./git-diff.js";
import { recordsToPaths, withBoltSession, boltRun } from "./hydra/bolt.js";
import { entityKindForPath, normalizePath, stableKey } from "./identity.js";
import {
  affectedFilesFromPaths,
  extractTestsFromPaths,
} from "./impact.js";
import { encodeMSPathsQuery } from "./query-encode.js";
import type {
  ExtractResult,
  GraphPath,
  HydraError,
  ImpactTest,
  SafetyDecision,
} from "./types.js";

export interface ExplainRequest {
  repoRoot: string;
  gitRoot?: string;
  baseRef?: string;
  changed?: string[];
  repository?: string;
  json?: boolean;
  config?: KetoConfig;
}

export interface ExplainResult {
  mode: SafetyDecision["mode"];
  reasons: SafetyDecision["reasons"];
  changed: string[];
  affectedFiles: string[];
  affectedTests: ImpactTest[];
  selectedTests: string[];
  query?: string;
  bookmark?: string;
  extract: ExtractResult;
  hydraError?: HydraError;
  fixtureComparison?: ReturnType<typeof compareImpact>;
}

export async function explainChange(request: ExplainRequest): Promise<ExplainResult> {
  const config = request.config ?? loadConfig({ repository: request.repository });
  const repository = request.repository ?? config.repository;
  const extract = await extractRepository(request.repoRoot, repository);
  const changed = normalizeChanged(
    request.changed ??
      (request.baseRef
        ? await changedFilesForRepo(
            request.gitRoot ?? request.repoRoot,
            request.repoRoot,
            request.baseRef,
          )
        : []),
  );

  const expectedCases = await loadExpectedCases(request.repoRoot);
  const expectedCase = expectedCases
    ? findImpactCase(expectedCases, changed)
    : undefined;

  if (changed.length === 0) {
    const decision = decideFallback({
      changedPaths: changed,
      indexedPaths: extract.entities.map((entity) => entity.path),
      coverageWarnings: extract.warnings,
      selectedTests: [],
    });
    return {
      mode: decision.mode,
      reasons: decision.reasons.length
        ? decision.reasons
        : [{ code: "empty_result_nontrivial", detail: "no changed files" }],
      changed,
      affectedFiles: [],
      affectedTests: [],
      selectedTests: [],
      extract,
    };
  }

  const sourceValues = changed
    .filter((path) => extract.entities.some((entity) => entity.path === normalizePath(path)))
    .map((path) => stableKey(repository, path, entityKindForPath(path)));

  let paths: GraphPath[] = [];
  let query: string | undefined;
  let bookmark: string | undefined;
  let hydraError: HydraError | undefined;
  let queryLimitExceeded = false;

  const encoded = encodeMSPathsQuery({ sourceValues });
  if (!encoded.ok) {
    hydraError = { kind: "rejected", message: encoded.error };
  } else if (sourceValues.length === 0) {
    query = undefined;
  } else {
    query = encoded.query;
    try {
      const result = await withBoltSession(config, (session) =>
        boltRun(session, encoded.query, {}),
      );
      paths = recordsToPaths(result.records);
      bookmark = result.bookmark;
    } catch (error) {
      hydraError = error as HydraError;
    }
  }

  const affectedTests = extractTestsFromPaths(paths);
  const selected = affectedTests.map((item) => item.path);
  const fixtureComparison =
    expectedCase?.affected_tests && !expectedCase.fallback
      ? compareImpact(selected, expectedCase.affected_tests)
      : undefined;

  const decision = decideFallback({
    changedPaths: changed,
    indexedPaths: extract.entities.map((entity) => entity.path),
    coverageWarnings: extract.warnings,
    selectedTests: selected,
    hydraError,
    fixtureComparison,
    queryLimitExceeded,
  });

  if (decision.mode === "full_suite") {
    return {
      mode: "full_suite",
      reasons: decision.reasons,
      changed,
      affectedFiles: affectedFilesFromPaths(paths),
      affectedTests: [],
      selectedTests: [],
      query,
      bookmark,
      extract,
      hydraError,
      fixtureComparison,
    };
  }

  return {
    mode: "selected",
    reasons: [],
    changed,
    affectedFiles: affectedFilesFromPaths(paths),
    affectedTests,
    selectedTests: decision.tests,
    query,
    bookmark,
    extract,
    fixtureComparison,
  };
}

export function formatExplainHuman(result: ExplainResult): string {
  const lines: string[] = [];
  lines.push(`Keto explain`);
  lines.push(`Mode: ${result.mode}`);
  lines.push(`Changed files (${result.changed.length}):`);
  for (const path of result.changed) lines.push(`  ${path}`);
  if (result.mode === "full_suite") {
    lines.push("Reasons:");
    for (const reason of result.reasons) {
      lines.push(`  [${reason.code}] ${reason.detail}`);
    }
    lines.push("Selected tests: none (full suite)");
    return lines.join("\n");
  }
  lines.push(`Affected files (${result.affectedFiles.length}):`);
  for (const path of result.affectedFiles) lines.push(`  ${path}`);
  lines.push(`Affected tests (${result.affectedTests.length}):`);
  for (const test of result.affectedTests) {
    lines.push(`  ${test.path}`);
    for (const evidence of test.paths) {
      lines.push(`    path: ${evidence.join(" <- ")}`);
    }
  }
  if (result.bookmark) {
    lines.push(`Bookmark: ${result.bookmark}`);
  }
  return lines.join("\n");
}

async function loadExpectedCases(
  repoRoot: string,
): Promise<ExpectedImpactCase[] | undefined> {
  try {
    const raw = await readFile(join(repoRoot, "keto.fixture.json"), "utf8");
    const parsed = JSON.parse(raw) as { cases?: ExpectedImpactCase[] };
    return parsed.cases;
  } catch {
    return undefined;
  }
}
