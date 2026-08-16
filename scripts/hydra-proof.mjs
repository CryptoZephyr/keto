#!/usr/bin/env node
/**
 * Phase 1 proof: /readyz plus HTTP write/read returning vertex id 2,
 * then a Bolt connectivity check. Never prints the bearer token.
 */
const token = process.env.HYDRADB_AUTH_TOKEN ?? "local-development-token-32-bytes";
const httpUrl = process.env.HYDRADB_HTTP_URL ?? "http://127.0.0.1:8443";
const boltUrl = process.env.HYDRADB_BOLT_URL ?? "bolt://127.0.0.1:7687";
const namespace = process.env.HYDRADB_NAMESPACE ?? "keto";
const graphId = process.env.HYDRADB_GRAPH_ID ?? "keto";
const cellId = process.env.HYDRADB_CELL_ID ?? "cell-0";

function redact(text) {
  return String(text).replaceAll(token, "[redacted]");
}

async function ready() {
  const response = await fetch("http://127.0.0.1:9090/readyz");
  if (!response.ok) {
    throw new Error(`/readyz ${response.status}`);
  }
  process.stdout.write("readyz=ok\n");
}

async function query(queryId, cypher) {
  const response = await fetch(`${httpUrl.replace(/\/$/, "")}/v1/graphs/${graphId}/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Graph-Namespace": namespace,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ cell_id: cellId, query_id: queryId, query: cypher }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${redact(text)}`);
  }
  return JSON.parse(text);
}

async function httpRoundTrip() {
  await query(
    "setup-write-1",
    "CREATE (a:CodeEntity {id: 1, stable_key: 'setup:a'})-[:DEPENDS_ON {id: 100}]->(b:CodeEntity {id: 2, stable_key: 'setup:b'})",
  );
  const read = await query(
    "setup-read-1",
    "MATCH (a {id: 1})-[:DEPENDS_ON]->(b) RETURN b.id AS id",
  );
  process.stdout.write(`${JSON.stringify({ query_id: read.query_id, rows: read.rows }, null, 2)}\n`);
  const first = read.rows?.[0]?.[0];
  const value = first && typeof first === "object" && "value" in first ? first.value : first;
  if (Number(value) !== 2) {
    throw new Error(`expected vertex id 2, got ${JSON.stringify(first)}`);
  }
  process.stdout.write("http-write-read=ok vertex_id=2\n");
}

async function boltConnect() {
  const neo4j = await import("neo4j-driver");
  const driver = neo4j.default.driver(
    boltUrl,
    { scheme: "bearer", credentials: token },
    { encrypted: false },
  );
  try {
    const session = driver.session({ database: graphId });
    const result = await session.run("MATCH (b {id: 2}) RETURN b.id AS id");
    const id = result.records[0]?.get("id");
    const number = typeof id?.toNumber === "function" ? id.toNumber() : Number(id);
    await session.close();
    if (number !== 2) {
      throw new Error(`bolt expected id 2, got ${String(id)}`);
    }
    process.stdout.write("bolt=ok vertex_id=2\n");
  } finally {
    await driver.close();
  }
}

const step = process.argv[2] ?? "all";
try {
  if (step === "ready" || step === "all") await ready();
  if (step === "http" || step === "all") await httpRoundTrip();
  if (step === "bolt" || step === "all") await boltConnect();
} catch (error) {
  process.stderr.write(`${redact(error instanceof Error ? error.message : error)}\n`);
  process.exit(1);
}
