import { normalizePath } from "./identity.js";
import { isSourcePath } from "./extract.js";

const LOCKFILES = new Set([
  "package-lock.json",
  "npm-shrinkwrap.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lock",
  "bun.lockb",
]);

const ROOT_CONFIG_NAMES = new Set([
  "package.json",
  "tsconfig.json",
  "jsconfig.json",
  "turbo.json",
  "nx.json",
  "lerna.json",
]);

export type PathClass =
  | "lockfile"
  | "root_config"
  | "test_config"
  | "shared_tooling"
  | "source"
  | "other";

export function classifyChangedPath(path: string): PathClass {
  const normalized = normalizePath(path);
  const base = basename(normalized);
  if (LOCKFILES.has(base)) return "lockfile";
  if (isTestConfig(normalized, base)) return "test_config";
  if (isSharedTooling(normalized, base)) return "shared_tooling";
  if (isRootConfig(normalized, base)) return "root_config";
  if (isSourcePath(normalized)) return "source";
  return "other";
}

function isRootConfig(normalized: string, base: string): boolean {
  if (ROOT_CONFIG_NAMES.has(base) && !normalized.includes("/")) {
    return true;
  }
  if (/^tsconfig\.[^/]+\.json$/.test(base) && !normalized.includes("/")) {
    return true;
  }
  return false;
}

function isTestConfig(normalized: string, base: string): boolean {
  return (
    /^vitest\.config\./.test(base) ||
    /^jest\.config\./.test(base) ||
    /^playwright\.config\./.test(base) ||
    base === "jest.config.js" ||
    base === "jest.config.ts" ||
    base === "jest.config.cjs" ||
    base === "jest.config.mjs" ||
    base === "vitest.config.ts" ||
    base === "vitest.config.js" ||
    base === "vitest.config.mts"
  );
}

function isSharedTooling(normalized: string, base: string): boolean {
  return (
    /^webpack\.config\./.test(base) ||
    /^rollup\.config\./.test(base) ||
    /^vite\.config\./.test(base) ||
    /^babel\.config\./.test(base) ||
    /^\.babelrc/.test(base) ||
    /^eslint\.config\./.test(base) ||
    /^\.eslintrc/.test(base) ||
    /^\.prettierrc/.test(base) ||
    /^prettier\.config\./.test(base)
  );
}

function basename(path: string): string {
  const parts = normalizePath(path).split("/");
  return parts[parts.length - 1] ?? path;
}

export function isNonTrivialSourceChange(changedPaths: readonly string[]): boolean {
  return changedPaths.some((path) => classifyChangedPath(path) === "source");
}
