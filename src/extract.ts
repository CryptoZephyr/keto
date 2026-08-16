import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import ts from "typescript";
import {
  assignEntityIdentity,
  assignRelationshipIdentity,
  assertNoCollisions,
  entityKindForPath,
  isTestPath,
  normalizePath,
} from "./identity.js";
import type {
  AliasMap,
  CodeEntity,
  CoverageWarning,
  DependsOnEdge,
  ExtractResult,
} from "./types.js";

export interface StaticImport {
  kind: "static";
  specifier: string;
}

export interface DynamicImport {
  kind: "dynamic";
  specifier?: string;
  detail: string;
}

export type ParsedImport = StaticImport | DynamicImport;

export interface SourceImports {
  imports: ParsedImport[];
  parseErrors: string[];
}

export interface ResolveInput {
  fromFile: string;
  specifier: string;
  existingFiles: ReadonlySet<string>;
  aliases?: AliasMap;
}

const SOURCE_FILE = /\.(?:[cm]?[jt]sx?)$/;
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "coverage",
  ".git",
  ".hydradb",
  ".keto-cache",
]);
const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"];

export function isSourcePath(path: string): boolean {
  return SOURCE_FILE.test(normalizePath(path));
}

export function extractImportsFromSource(
  sourceText: string,
  fileName: string,
): SourceImports {
  const scriptKind = scriptKindFor(fileName);
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
  const parseErrors = collectParseErrors(sourceFile);
  const imports: ParsedImport[] = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isImportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      imports.push({ kind: "static", specifier: node.moduleSpecifier.text });
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      imports.push({ kind: "static", specifier: node.moduleSpecifier.text });
    } else if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if (expr.kind === ts.SyntaxKind.ImportKeyword) {
        const arg = node.arguments[0];
        if (arg && ts.isStringLiteral(arg)) {
          imports.push({
            kind: "dynamic",
            specifier: arg.text,
            detail: "dynamic import() is not turned into a DEPENDS_ON edge",
          });
        } else {
          imports.push({
            kind: "dynamic",
            detail: "dynamic import() with a non-literal specifier",
          });
        }
      } else if (
        ts.isIdentifier(expr) &&
        expr.text === "require" &&
        node.arguments.length >= 1
      ) {
        const arg = node.arguments[0];
        if (arg && ts.isStringLiteral(arg)) {
          imports.push({ kind: "static", specifier: arg.text });
        } else {
          imports.push({
            kind: "dynamic",
            detail: "require() with a non-literal specifier",
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return { imports, parseErrors };
}

function scriptKindFor(fileName: string): ts.ScriptKind {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (lower.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (lower.endsWith(".ts") || lower.endsWith(".mts") || lower.endsWith(".cts")) {
    return ts.ScriptKind.TS;
  }
  return ts.ScriptKind.JS;
}

function collectParseErrors(sourceFile: ts.SourceFile): string[] {
  const diagnostics =
    (
      sourceFile as ts.SourceFile & {
        parseDiagnostics?: readonly ts.Diagnostic[];
      }
    ).parseDiagnostics ?? [];
  return diagnostics
    .filter((diag) => diag.category === ts.DiagnosticCategory.Error)
    .map((diag) => ts.flattenDiagnosticMessageText(diag.messageText, "\n"));
}

export function expandAlias(specifier: string, aliases: AliasMap = {}): string[] {
  const expanded: string[] = [];
  for (const [pattern, targets] of Object.entries(aliases)) {
    if (pattern.endsWith("/*")) {
      const prefix = pattern.slice(0, -1);
      if (specifier.startsWith(prefix)) {
        const rest = specifier.slice(prefix.length);
        for (const target of targets) {
          const base = target.endsWith("/*") ? target.slice(0, -1) : `${target}/`;
          expanded.push(`${base}${rest}`);
        }
      }
    } else if (specifier === pattern) {
      expanded.push(...targets);
    }
  }
  return expanded;
}

export function resolveImportSpecifier(input: ResolveInput): string | null {
  const fromFile = normalizePath(input.fromFile);
  const candidates: string[] = [];
  if (input.specifier.startsWith(".")) {
    const fromDir = fromFile.includes("/")
      ? fromFile.slice(0, fromFile.lastIndexOf("/"))
      : "";
    candidates.push(posixJoin(fromDir, input.specifier));
  } else {
    const aliased = expandAlias(input.specifier, input.aliases);
    if (aliased.length === 0) {
      return null;
    }
    candidates.push(...aliased.map(normalizePath));
  }

  for (const candidate of candidates) {
    const resolved = matchExisting(normalizePath(candidate), input.existingFiles);
    if (resolved) {
      return resolved;
    }
  }
  return null;
}

function posixJoin(dir: string, specifier: string): string {
  const parts = [...(dir ? dir.split("/") : []), ...specifier.split("/")];
  const stack: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  return stack.join("/");
}

function matchExisting(
  candidate: string,
  existingFiles: ReadonlySet<string>,
): string | null {
  const stripped = candidate.replace(/\.(?:[cm]?[jt]sx?)$/, "");
  const options = [
    candidate,
    ...EXTENSIONS.map((ext) => `${stripped}${ext}`),
    ...EXTENSIONS.map((ext) => `${candidate}/index${ext}`),
    ...EXTENSIONS.map((ext) => `${stripped}/index${ext}`),
  ];
  for (const option of options) {
    const normalized = normalizePath(option);
    if (existingFiles.has(normalized)) {
      return normalized;
    }
  }
  return null;
}

export interface BuildGraphInput {
  repository: string;
  files: Record<string, string>;
  aliases?: AliasMap;
}

export function buildGraph(input: BuildGraphInput): ExtractResult {
  const files = new Map<string, string>();
  for (const [rawPath, source] of Object.entries(input.files)) {
    const path = normalizePath(rawPath);
    if (!isSourcePath(path)) continue;
    files.set(path, source);
  }

  const existingFiles = new Set(files.keys());
  const entities: CodeEntity[] = [];
  const entityByPath = new Map<string, CodeEntity>();
  const warnings: CoverageWarning[] = [];

  for (const [path, source] of [...files.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const entity = assignEntityIdentity(input.repository, path, source);
    entities.push(entity);
    entityByPath.set(path, entity);
  }

  assertNoCollisions(entities);

  const relationships: DependsOnEdge[] = [];
  for (const [path, source] of [...files.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const sourceEntity = entityByPath.get(path);
    if (!sourceEntity) continue;
    const parsed = extractImportsFromSource(source, path);
    for (const error of parsed.parseErrors) {
      warnings.push({
        type: "parse_error",
        path,
        detail: error,
      });
    }
    for (const item of parsed.imports) {
      if (item.kind === "dynamic") {
        warnings.push({
          type: "dynamic_import",
          path,
          specifier: item.specifier,
          detail: item.detail,
        });
        continue;
      }
      if (!item.specifier.startsWith(".") && !matchesAlias(item.specifier, input.aliases)) {
        continue;
      }
      const resolved = resolveImportSpecifier({
        fromFile: path,
        specifier: item.specifier,
        existingFiles,
        aliases: input.aliases,
      });
      if (!resolved) {
        warnings.push({
          type: item.specifier.startsWith(".") || matchesAlias(item.specifier, input.aliases)
            ? "unresolved"
            : "unresolved",
          path,
          specifier: item.specifier,
          detail: `could not resolve ${item.specifier} from ${path}`,
        });
        continue;
      }
      const destination = entityByPath.get(resolved);
      if (!destination) {
        warnings.push({
          type: "missing_file",
          path,
          specifier: item.specifier,
          detail: `resolved ${resolved} is not a CodeEntity`,
        });
        continue;
      }
      const kind = isTestPath(path) ? "tests" : "imports";
      relationships.push(
        assignRelationshipIdentity(sourceEntity, destination, kind, item.specifier),
      );
    }
  }

  assertNoCollisions(relationships);

  relationships.sort((a, b) => a.stable_key.localeCompare(b.stable_key));
  entities.sort((a, b) => a.stable_key.localeCompare(b.stable_key));
  warnings.sort((a, b) => {
    const left = `${a.path}|${a.type}|${a.specifier ?? ""}`;
    const right = `${b.path}|${b.type}|${b.specifier ?? ""}`;
    return left.localeCompare(right);
  });

  return {
    repository: input.repository,
    identity_version: 1,
    entities,
    relationships,
    warnings,
  };
}

function matchesAlias(specifier: string, aliases?: AliasMap): boolean {
  if (!aliases) return false;
  return expandAlias(specifier, aliases).length > 0;
}

export async function extractRepository(
  repoRoot: string,
  repository: string,
  aliases?: AliasMap,
): Promise<ExtractResult> {
  const resolvedAliases = aliases ?? (await readTsconfigAliases(repoRoot));
  const filePaths = await listSourceFiles(repoRoot);
  const files: Record<string, string> = {};
  for (const relative of filePaths) {
    files[relative] = await readFile(join(repoRoot, ...relative.split("/")), "utf8");
  }
  return buildGraph({ repository, files, aliases: resolvedAliases });
}

export async function listSourceFiles(repoRoot: string): Promise<string[]> {
  const found: string[] = [];
  const walk = async (abs: string, rel: string): Promise<void> => {
    const entries = await readdir(abs, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".") {
        if (SKIP_DIRS.has(entry.name)) continue;
        if (entry.isDirectory()) continue;
      }
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      const childAbs = join(abs, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(childAbs, childRel);
        continue;
      }
      if (isSourcePath(childRel)) {
        found.push(normalizePath(childRel));
      }
    }
  };
  const rootStat = await stat(repoRoot);
  if (!rootStat.isDirectory()) {
    throw new Error(`repository root is not a directory: ${repoRoot}`);
  }
  await walk(repoRoot, "");
  return found.sort();
}

export async function readTsconfigAliases(repoRoot: string): Promise<AliasMap> {
  const aliases: AliasMap = {};
  for (const name of ["tsconfig.json", "jsconfig.json"]) {
    try {
      const raw = await readFile(join(repoRoot, name), "utf8");
      const parsed = JSON.parse(raw) as {
        compilerOptions?: { paths?: Record<string, string[]>; baseUrl?: string };
      };
      const paths = parsed.compilerOptions?.paths ?? {};
      const baseUrl = parsed.compilerOptions?.baseUrl ?? ".";
      for (const [pattern, targets] of Object.entries(paths)) {
        aliases[pattern] = targets.map((target) =>
          normalizePath(baseUrl === "." ? target : `${baseUrl}/${target}`),
        );
      }
      break;
    } catch {
      // optional
    }
  }
  return aliases;
}
