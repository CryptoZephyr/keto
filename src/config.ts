import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export interface KetoConfig {
  boltUrl: string;
  httpUrl: string;
  authToken: string;
  namespace: string;
  graphId: string;
  cellId: string;
  queryTimeoutMs: number;
  repository: string;
}

export function loadConfig(overrides: Partial<KetoConfig> = {}): KetoConfig {
  return {
    boltUrl: overrides.boltUrl ?? env("HYDRADB_BOLT_URL", "bolt://127.0.0.1:7687"),
    httpUrl: overrides.httpUrl ?? env("HYDRADB_HTTP_URL", "http://127.0.0.1:8443"),
    authToken:
      overrides.authToken ?? env("HYDRADB_AUTH_TOKEN", "local-development-token-32-bytes"),
    namespace: overrides.namespace ?? env("HYDRADB_NAMESPACE", "keto"),
    graphId: overrides.graphId ?? env("HYDRADB_GRAPH_ID", "keto"),
    cellId: overrides.cellId ?? env("HYDRADB_CELL_ID", "cell-0"),
    queryTimeoutMs: overrides.queryTimeoutMs ?? numberEnv("HYDRADB_QUERY_TIMEOUT_MS", 10_000),
    repository: overrides.repository ?? env("KETO_REPOSITORY", "keto-fixture"),
  };
}

export async function maybeLoadDotEnv(repoRoot: string): Promise<void> {
  try {
    const raw = await readFile(resolve(repoRoot, ".env"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env is optional
  }
}

function env(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.length > 0 ? value : fallback;
}

function numberEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
