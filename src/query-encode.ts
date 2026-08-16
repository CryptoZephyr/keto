export const MAX_SOURCE_VALUES = 64;
export const MAX_QUERY_CHARS = 16_384;
export const DEFAULT_MAX_LEN = 4;
export const DEFAULT_PATH_COUNT = 20;
export const DEFAULT_RESULT_LIMIT = 500;
export const IMPACT_REL_TYPE = "DEPENDS_ON";

export interface MSPathsInput {
  sourceValues: string[];
  sourceLabel?: string;
  sourceProperty?: string;
  relTypes?: string[];
  relDirection?: "incoming" | "outgoing" | "both";
  maxLen?: number;
  pathCount?: number;
  resultLimit?: number;
}

export type EncodeResult =
  | { ok: true; query: string }
  | { ok: false; error: string };

const CONTROL = /[\u0000-\u001F\u007F]/;

export function escapeCypherString(value: string): EncodeResult {
  if (CONTROL.test(value)) {
    return {
      ok: false,
      error: "control characters are not allowed in Cypher string literals",
    };
  }
  return { ok: true, query: value.replace(/\\/g, "\\\\").replace(/'/g, "\\'") };
}

function escapeLiteral(value: string): EncodeResult {
  return escapeCypherString(value);
}

function quotedList(values: string[]): EncodeResult {
  const escaped: string[] = [];
  for (const value of values) {
    const result = escapeLiteral(value);
    if (!result.ok) {
      return result;
    }
    escaped.push(`'${result.query}'`);
  }
  return { ok: true, query: `[${escaped.join(", ")}]` };
}

export function encodeMSPathsQuery(input: MSPathsInput): EncodeResult {
  if (!input.sourceValues || input.sourceValues.length === 0) {
    return { ok: false, error: "sourceValues must not be empty" };
  }
  if (input.sourceValues.length > MAX_SOURCE_VALUES) {
    return {
      ok: false,
      error: `sourceValues exceeds limit of ${MAX_SOURCE_VALUES}`,
    };
  }
  if (input.sourceValues.some((value) => value.length === 0)) {
    return { ok: false, error: "sourceValues must not contain empty strings" };
  }

  const relTypes = input.relTypes ?? [IMPACT_REL_TYPE];
  if (relTypes.length === 0) {
    return { ok: false, error: "relTypes must not be empty" };
  }
  for (const relType of relTypes) {
    if (relType.includes("|")) {
      return {
        ok: false,
        error: `mixed relationship type patterns are not supported: ${relType}`,
      };
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(relType)) {
      return { ok: false, error: `invalid relationship type: ${relType}` };
    }
  }

  const sourceLabel = input.sourceLabel ?? "CodeEntity";
  const sourceProperty = input.sourceProperty ?? "stable_key";
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(sourceLabel)) {
    return { ok: false, error: `invalid sourceLabel: ${sourceLabel}` };
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(sourceProperty)) {
    return { ok: false, error: `invalid sourceProperty: ${sourceProperty}` };
  }

  const direction = input.relDirection ?? "incoming";
  if (direction !== "incoming" && direction !== "outgoing" && direction !== "both") {
    return { ok: false, error: "relDirection must be incoming, outgoing, or both" };
  }

  const maxLen = input.maxLen ?? DEFAULT_MAX_LEN;
  const pathCount = input.pathCount ?? DEFAULT_PATH_COUNT;
  const resultLimit = input.resultLimit ?? DEFAULT_RESULT_LIMIT;
  if (!Number.isInteger(maxLen) || maxLen < 1 || maxLen > 16) {
    return { ok: false, error: "maxLen must be an integer from 1 to 16" };
  }
  if (!Number.isInteger(pathCount) || pathCount < 1) {
    return { ok: false, error: "pathCount must be a positive integer" };
  }
  if (!Number.isInteger(resultLimit) || resultLimit < 1) {
    return { ok: false, error: "resultLimit must be a positive integer" };
  }

  const sourceList = quotedList(input.sourceValues);
  if (!sourceList.ok) {
    return sourceList;
  }
  const relList = quotedList(relTypes);
  if (!relList.ok) {
    return relList;
  }

  const query = [
    "CALL algo.MSpaths({",
    `  sourceLabel: '${sourceLabel}',`,
    `  sourceProperty: '${sourceProperty}',`,
    `  sourceValues: ${sourceList.query},`,
    `  relTypes: ${relList.query},`,
    `  relDirection: '${direction}',`,
    `  maxLen: ${maxLen},`,
    `  pathCount: ${pathCount},`,
    `  resultLimit: ${resultLimit}`,
    "})",
    "YIELD path",
    "RETURN path",
  ].join("\n");

  if (query.includes("MATCH path =") || /IMPORTS\s*\|\s*CALLS/.test(query)) {
    return { ok: false, error: "refusing to emit an unsupported path query" };
  }
  if (query.length > MAX_QUERY_CHARS) {
    return {
      ok: false,
      error: `encoded query exceeds ${MAX_QUERY_CHARS} characters`,
    };
  }
  return { ok: true, query };
}
