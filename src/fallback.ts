import { isSourcePath } from "./extract.js";
import { normalizePath } from "./identity.js";
import { classifyChangedPath, isNonTrivialSourceChange } from "./unsafe-paths.js";
import type {
  CoverageWarning,
  FallbackReasonDetail,
  FixtureComparison,
  HydraError,
  SafetyDecision,
} from "./types.js";

export interface FallbackInput {
  changedPaths: string[];
  indexedPaths: Iterable<string>;
  coverageWarnings: CoverageWarning[];
  selectedTests: string[];
  hydraError?: HydraError;
  fixtureComparison?: FixtureComparison;
  queryLimitExceeded?: boolean;
  maxSelectedTests?: number;
  allowlistedPaths?: string[];
}

export const DEFAULT_MAX_SELECTED_TESTS = 200;

export function decideFallback(input: FallbackInput): SafetyDecision {
  const reasons: FallbackReasonDetail[] = [];
  const indexed = new Set([...input.indexedPaths].map(normalizePath));
  const changed = input.changedPaths.map(normalizePath);
  const allowlisted = new Set((input.allowlistedPaths ?? []).map(normalizePath));
  const maxSelected = input.maxSelectedTests ?? DEFAULT_MAX_SELECTED_TESTS;

  if (input.hydraError) {
    reasons.push(hydraReason(input.hydraError));
  }

  if (input.queryLimitExceeded) {
    reasons.push({
      code: "query_limit",
      detail: "HydraDB query hit a depth, path, result, or runtime limit",
    });
  }

  if (input.selectedTests.length > maxSelected) {
    reasons.push({
      code: "query_limit",
      detail: `selected test count ${input.selectedTests.length} exceeds ${maxSelected}`,
    });
  }

  if (input.fixtureComparison && !input.fixtureComparison.match) {
    reasons.push({
      code: "fixture_mismatch",
      detail: input.fixtureComparison.detail,
    });
  }

  for (const path of changed) {
    const classification = classifyChangedPath(path);
    if (classification === "lockfile") {
      reasons.push({ code: "lockfile", detail: path });
    } else if (classification === "root_config") {
      reasons.push({ code: "root_config", detail: path });
    } else if (classification === "test_config") {
      reasons.push({ code: "test_config", detail: path });
    } else if (classification === "shared_tooling") {
      reasons.push({ code: "shared_tooling", detail: path });
    } else if (isSourcePath(path) && !indexed.has(path)) {
      reasons.push({ code: "changed_path_absent", detail: path });
    }
  }

  for (const warning of input.coverageWarnings) {
    const warningPath = normalizePath(warning.path);
    if (!changed.includes(warningPath)) {
      continue;
    }
    if (warning.type === "dynamic_import") {
      reasons.push({
        code: "dynamic_import",
        detail: `${warningPath}: ${warning.detail}`,
      });
    } else if (warning.type === "parse_error") {
      reasons.push({
        code: "parse_error",
        detail: `${warningPath}: ${warning.detail}`,
      });
    } else if (warning.type === "unresolved") {
      reasons.push({
        code: "unresolved_import",
        detail: `${warningPath}: ${warning.detail}`,
      });
    } else if (warning.type === "missing_file") {
      reasons.push({
        code: "missing_file",
        detail: `${warningPath}: ${warning.detail}`,
      });
    }
  }

  if (reasons.length > 0) {
    return { mode: "full_suite", tests: [], reasons: dedupeReasons(reasons) };
  }

  const uniqueTests = uniqueNormalized(input.selectedTests);
  if (
    uniqueTests.length === 0 &&
    isNonTrivialSourceChange(changed) &&
    !changed.every((path) => allowlisted.has(path))
  ) {
    return {
      mode: "full_suite",
      tests: [],
      reasons: [
        {
          code: "empty_result_nontrivial",
          detail:
            "no affected tests for a non-trivial source change; failing closed to the full suite",
        },
      ],
    };
  }

  return { mode: "selected", tests: uniqueTests, reasons: [] };
}

function hydraReason(error: HydraError): FallbackReasonDetail {
  switch (error.kind) {
    case "unavailable":
      return { code: "hydradb_unavailable", detail: error.message };
    case "timeout":
      return { code: "hydradb_timeout", detail: error.message };
    case "rejected":
      return { code: "hydradb_rejected", detail: error.message };
    case "budget":
      return { code: "hydradb_budget", detail: error.message };
  }
}

function uniqueNormalized(paths: readonly string[]): string[] {
  return [...new Set(paths.map(normalizePath))].sort();
}

function dedupeReasons(reasons: FallbackReasonDetail[]): FallbackReasonDetail[] {
  const seen = new Set<string>();
  const out: FallbackReasonDetail[] = [];
  for (const reason of reasons) {
    const key = `${reason.code}|${reason.detail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(reason);
  }
  return out;
}
