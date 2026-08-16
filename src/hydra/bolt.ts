import neo4j, { type Driver, type ManagedTransaction, type Session } from "neo4j-driver";
import type { KetoConfig } from "../config.js";
import type { GraphPath, HydraError } from "../types.js";

const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

export function assertIdempotencyKey(key: string): string {
  if (!IDEMPOTENCY_PATTERN.test(key)) {
    throw new Error(
      "hydradb.idempotency_key must be 1-128 ASCII letters, digits, '.', '_' or '-'",
    );
  }
  return key;
}

export function createBoltDriver(config: KetoConfig): Driver {
  const auth = {
    scheme: "bearer",
    credentials: config.authToken,
  };
  return neo4j.driver(config.boltUrl, auth, {
    encrypted: false,
    connectionTimeout: config.queryTimeoutMs,
    maxConnectionLifetime: 60_000,
    disableLosslessIntegers: false,
  });
}

export async function withBoltSession<T>(
  config: KetoConfig,
  fn: (session: Session) => Promise<T>,
): Promise<T> {
  const driver = createBoltDriver(config);
  const session = driver.session({
    database: config.boltDatabase,
    defaultAccessMode: neo4j.session.WRITE,
  });
  try {
    return await fn(session);
  } catch (error) {
    throw classifyBoltError(error);
  } finally {
    await session.close();
    await driver.close();
  }
}

export async function boltRun(
  session: Session,
  query: string,
  parameters: Record<string, unknown>,
  timeoutMs: number,
  idempotencyKey?: string,
): Promise<{ records: Array<Record<string, unknown>>; bookmark?: string }> {
  assertQueryTimeout(timeoutMs);
  const metadata = idempotencyKey
    ? { "hydradb.idempotency_key": assertIdempotencyKey(idempotencyKey) }
    : undefined;
  try {
    const result = await session.run(query, integerize(parameters), {
      ...(metadata ? { metadata } : {}),
      timeout: timeoutMs,
    });
    const records = result.records.map((record) => record.toObject());
    const bookmark = lastBookmark(session);
    return { records, bookmark };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const labeled = `Bolt ${query.split("\n")[0]}: ${message}`;
    throw Object.assign(new Error(labeled), {
      kind: /ECONNREFUSED|Failed to connect/i.test(message)
        ? ("unavailable" as const)
        : /timeout/i.test(message)
          ? ("timeout" as const)
          : ("rejected" as const),
      message: labeled,
    });
  }
}

export async function boltWrite(
  session: Session,
  query: string,
  parameters: Record<string, unknown>,
  timeoutMs: number,
  idempotencyKey: string,
): Promise<{ bookmark?: string }> {
  assertQueryTimeout(timeoutMs);
  const metadata = {
    "hydradb.idempotency_key": assertIdempotencyKey(idempotencyKey),
  };
  await session.executeWrite(
    async (tx: ManagedTransaction) => tx.run(query, integerize(parameters)),
    {
      metadata,
      timeout: timeoutMs,
    },
  );
  return { bookmark: lastBookmark(session) };
}

function assertQueryTimeout(timeoutMs: number): void {
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error("Bolt query execution timeout must be a positive integer in milliseconds");
  }
}

export function recordsToPaths(records: Array<Record<string, unknown>>): GraphPath[] {
  const paths: GraphPath[] = [];
  for (const record of records) {
    const raw = record.path ?? record.PATH ?? Object.values(record)[0];
    const path = coercePath(raw);
    if (path) paths.push(path);
  }
  return paths;
}

function coercePath(value: unknown): GraphPath | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as {
    nodes?: unknown;
    segments?: Array<{ start?: unknown; end?: unknown }>;
    start?: unknown;
    end?: unknown;
  };
  if (Array.isArray(candidate.nodes)) {
    return {
      nodes: candidate.nodes.map(nodeFromBolt),
    };
  }
  if (Array.isArray(candidate.segments)) {
    const nodes = [];
    if (candidate.start) nodes.push(nodeFromBolt(candidate.start));
    for (const segment of candidate.segments) {
      if (segment.end) nodes.push(nodeFromBolt(segment.end));
    }
    return { nodes };
  }
  return null;
}

function nodeFromBolt(value: unknown): {
  properties: Record<string, unknown>;
  id?: number;
  labels?: string[];
} {
  if (!value || typeof value !== "object") return { properties: {} };
  const node = value as {
    properties?: Record<string, unknown>;
    identity?: { toNumber?: () => number } | number;
    labels?: string[];
  };
  const properties = { ...(node.properties ?? {}) };
  for (const [key, item] of Object.entries(properties)) {
    properties[key] = fromNeo4j(item);
  }
  const identity =
    typeof node.identity === "number"
      ? node.identity
      : node.identity && typeof node.identity.toNumber === "function"
        ? node.identity.toNumber()
        : undefined;
  return {
    id: identity,
    labels: node.labels,
    properties,
  };
}

function fromNeo4j(value: unknown): unknown {
  if (value && typeof value === "object" && "toNumber" in value && typeof value.toNumber === "function") {
    return (value as { toNumber: () => number }).toNumber();
  }
  return value;
}

function integerize(value: unknown): unknown {
  if (typeof value === "number" && Number.isInteger(value)) {
    return neo4j.int(value);
  }
  if (Array.isArray(value)) {
    return value.map(integerize);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = integerize(item);
    }
    return out;
  }
  return value;
}

function lastBookmark(session: Session): string | undefined {
  try {
    const bookmarks = session.lastBookmarks();
    return bookmarks[bookmarks.length - 1];
  } catch {
    return undefined;
  }
}

function classifyBoltError(error: unknown): HydraError & Error {
  const message = error instanceof Error ? error.message : String(error);
  let kind: HydraError["kind"] = "rejected";
  if (/ECONNREFUSED|ENOTFOUND|Failed to connect|ServiceUnavailable/i.test(message)) {
    kind = "unavailable";
  } else if (/timeout|Timed out/i.test(message)) {
    kind = "timeout";
  } else if (/budget|AdmissionRejected|resultLimit|maxLen/i.test(message)) {
    kind = "budget";
  }
  return Object.assign(new Error(message), { kind, message });
}
