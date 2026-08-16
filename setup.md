# Setup and Installation — Keto

**Cost target:** $0 by staying within the included GitHub Codespaces allowance  
**Local machine:** Browser/editor only; do not install or run Docker, WSL, Rust, or HydraDB locally  
**Remote environment:** Smallest available 2-core GitHub Codespace attached to the public Keto repository

---

## 1. Zero-Cost Guardrails

Before creating the Codespace:

1. Use a personal GitHub Free/Pro account whose included Codespaces quota is available.
2. Set the Codespaces spending budget to `$0` or enable “stop usage when budget limit is reached.”
3. Choose the smallest 2-core machine.
4. Set the idle timeout to 5–10 minutes.
5. Stop the Codespace whenever you are not actively using it.
6. Push work frequently so the Codespace can be deleted and recreated.

Included usage is finite and can change. Check GitHub Billing → Usage before relying on the remaining quota. “Zero cost” means the project stays within that allowance; it is not an unlimited free server.

---

## 2. Repository Preparation

The submission repository must be public and must not contain participant-authored commits before August 12, 2026.

Before starting HydraDB, add these entries to `.gitignore`:

```gitignore
.env
.hydradb/
node_modules/
dist/
coverage/
```

Never commit the HydraDB token, local object-store data, or cache.

---

## 3. Start HydraDB Inside Codespaces

Keto does not build HydraDB from Rust source. It runs the published multi-architecture image inside the remote Codespace. Pin the tested hackathon version instead of `latest`.

From the Keto repository root in the Codespace terminal:

```bash
mkdir -p .hydradb/store .hydradb/cache
printf '%s\n' 'local-development-token-32-bytes' > .hydradb/auth-token
chmod 600 .hydradb/auth-token

docker pull ghcr.io/hydra-db/hydradb:0.1.1

docker run -d --name keto-hydradb \
  --user "$(id -u):$(id -g)" \
  -p 127.0.0.1:7687:7687 \
  -p 127.0.0.1:8443:8443 \
  -p 127.0.0.1:9090:9090 \
  -v "$PWD/.hydradb:/data" \
  -e CLOUD_PROVIDER=local \
  -e LOCAL_PATH=/data/store \
  -e GRAPH_NAMESPACE=keto \
  -e GRAPH_ID=keto \
  -e GRAPH_CELL_ID=cell-0 \
  -e GRAPH_CELLS=cell-0 \
  -e GRAPH_NODE_ID=node-0 \
  -e GRAPH_BOLT_NODE_ADDRESSES=node-0=127.0.0.1:7687 \
  -e GRAPH_ADVERTISED_BOLT_ADDR=127.0.0.1:7687 \
  -e GRAPH_DATA_CACHE_DIR=/data/cache \
  -e GRAPH_AUTH_TOKEN_FILE=/data/auth-token \
  -e GRAPH_ALLOW_PLAINTEXT=true \
  -e RUST_MIN_STACK=33554432 \
  ghcr.io/hydra-db/hydradb:0.1.1
```

These ports are bound to loopback only. Do not change their Codespaces visibility to public.

Check startup:

```bash
docker logs keto-hydradb
curl -fsS http://127.0.0.1:9090/readyz
```

A readiness response proves only that the process started. Verify a real write/read round trip:

```bash
TOKEN='local-development-token-32-bytes'

curl -fsS http://127.0.0.1:8443/v1/graphs/keto/query \
  -H "Authorization: Bearer $TOKEN" \
  -H 'X-Graph-Namespace: keto' \
  -H 'Content-Type: application/json' \
  --data @- <<'JSON'
{"cell_id":"cell-0","query_id":"setup-write-1","query":"CREATE (a:CodeEntity {id: 1, stable_key: 'setup:a'})-[:DEPENDS_ON {id: 100}]->(b:CodeEntity {id: 2, stable_key: 'setup:b'})"}
JSON

curl -fsS http://127.0.0.1:8443/v1/graphs/keto/query \
  -H "Authorization: Bearer $TOKEN" \
  -H 'X-Graph-Namespace: keto' \
  -H 'Content-Type: application/json' \
  --data @- <<'JSON'
{"cell_id":"cell-0","query_id":"setup-read-1","query":"MATCH (a {id: 1})-[:DEPENDS_ON]->(b) RETURN b.id AS id"}
JSON
```

The second response must contain one row with vertex ID `2`. Reset the disposable setup graph before indexing the real fixture:

```bash
docker rm -f keto-hydradb
rm -rf .hydradb/store .hydradb/cache
mkdir -p .hydradb/store .hydradb/cache
```

Then rerun the `docker run` command above. The token file remains in place.

---

## 4. Optional Background Indexer

Do not make the first correctness milestone depend on a compiled index. After the fixture passes against canonical reads, start the indexer for the final performance demonstration:

```bash
docker run -d --name keto-hydradb-indexer \
  --user "$(id -u):$(id -g)" \
  -p 127.0.0.1:9091:9091 \
  -v "$PWD/.hydradb:/data" \
  -e CLOUD_PROVIDER=local \
  -e LOCAL_PATH=/data/store \
  -e GRAPH_NAMESPACE=keto \
  -e GRAPH_ID=keto \
  -e GRAPH_CELLS=cell-0 \
  --entrypoint graph-indexer \
  ghcr.io/hydra-db/hydradb:0.1.1

curl -fsS http://127.0.0.1:9091/readyz
docker logs keto-hydradb-indexer
```

Ingest first, then allow indexing activity to settle before a timed query. Do not mutate the graph during the benchmark. If the image does not expose `graph-indexer` on its executable path, record the exact error and ask the HydraDB Discord for the supported container invocation rather than building from source.

---

## 5. Keto Application Setup

Target Node.js 20 or newer in Codespaces.

```bash
npm install
cp .env.example .env
```

Local-only `.env`:

```env
HYDRADB_BOLT_URL=bolt://127.0.0.1:7687
HYDRADB_HTTP_URL=http://127.0.0.1:8443
HYDRADB_AUTH_TOKEN=local-development-token-32-bytes
HYDRADB_NAMESPACE=keto
HYDRADB_GRAPH_ID=keto
HYDRADB_CELL_ID=cell-0
HYDRADB_QUERY_TIMEOUT_MS=10000
```

Suggested commands once implemented:

```bash
npm run keto:index -- --repo ./fixtures/monorepo
npm run keto:explain -- --repo ./fixtures/monorepo --base HEAD~1
npm run keto:test -- --repo ./fixtures/monorepo --base HEAD~1
npm test
```

---

## 6. Stop and Resume

Stop containers before stopping the Codespace:

```bash
docker stop keto-hydradb-indexer 2>/dev/null || true
docker stop keto-hydradb
```

Resume later:

```bash
docker start keto-hydradb
docker start keto-hydradb-indexer 2>/dev/null || true
curl -fsS http://127.0.0.1:9090/readyz
```

If HydraDB fails, inspect `docker logs keto-hydradb` before changing configuration. Keep the `.hydradb` directory only while its data is useful; it consumes Codespaces storage even while the Codespace is stopped.
