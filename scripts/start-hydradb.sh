#!/usr/bin/env bash
# Start the pinned HydraDB node on Codespace loopback. See setup.md.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

mkdir -p .hydradb/store .hydradb/cache
if [[ ! -f .hydradb/auth-token ]]; then
  printf '%s\n' 'local-development-token-32-bytes' > .hydradb/auth-token
  chmod 600 .hydradb/auth-token
fi

docker pull ghcr.io/hydra-db/hydradb:0.1.1

docker rm -f keto-hydradb >/dev/null 2>&1 || true

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

echo "waiting for /readyz"
for _ in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:9090/readyz >/dev/null; then
    echo "hydradb ready"
    exit 0
  fi
  sleep 1
done

echo "hydradb did not become ready" >&2
docker logs keto-hydradb >&2 || true
exit 1
