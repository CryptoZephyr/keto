import type { KetoConfig } from "../config.js";
import { unwrapHttpValue } from "../impact.js";
import type { HydraError } from "../types.js";

export interface HttpQueryResult {
  query_id: string;
  columns: string[];
  rows: unknown[][];
  bookmark?: string;
  read_epoch?: number;
}

export async function httpQuery(
  config: KetoConfig,
  query: string,
  queryId: string,
  parameters: Record<string, unknown> = {},
): Promise<HttpQueryResult> {
  const url = `${config.httpUrl.replace(/\/$/, "")}/v1/graphs/${config.graphId}/query`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.queryTimeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.authToken}`,
        "X-Graph-Namespace": config.namespace,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cell_id: config.cellId,
        query_id: queryId,
        query,
        parameters,
        timeout_ms: config.queryTimeoutMs,
      }),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw hydraHttpError(response.status, text);
    }
    const parsed = JSON.parse(text) as HttpQueryResult;
    return {
      ...parsed,
      rows: (parsed.rows ?? []).map((row) => row.map(unwrapHttpValue)),
    };
  } catch (error) {
    throw classifyHttpError(error);
  } finally {
    clearTimeout(timer);
  }
}

export async function httpReady(config: KetoConfig): Promise<boolean> {
  const url = new URL(config.httpUrl);
  const ready = `${url.protocol}//${url.hostname}:9090/readyz`;
  try {
    const response = await fetch(ready);
    return response.ok;
  } catch {
    return false;
  }
}

function classifyHttpError(error: unknown): HydraError & Error {
  if (error && typeof error === "object" && "kind" in error) {
    return error as HydraError & Error;
  }
  if (error instanceof Error && error.name === "AbortError") {
    return Object.assign(new Error("HydraDB HTTP query timed out"), {
      kind: "timeout" as const,
      message: "HydraDB HTTP query timed out",
    });
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/ECONNREFUSED|fetch failed|ENOTFOUND|ECONNRESET/i.test(message)) {
    return Object.assign(new Error(message), {
      kind: "unavailable" as const,
      message,
    });
  }
  return Object.assign(new Error(message), {
    kind: "rejected" as const,
    message,
  });
}

function hydraHttpError(status: number, body: string): HydraError & Error {
  const kind: HydraError["kind"] =
    status === 429 || /budget|limit|admission/i.test(body)
      ? "budget"
      : status >= 500
        ? "unavailable"
        : "rejected";
  const message = `HydraDB HTTP ${status}: ${redact(body)}`;
  return Object.assign(new Error(message), { kind, message });
}

function redact(text: string): string {
  return text.replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [redacted]").slice(0, 500);
}
