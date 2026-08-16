#!/usr/bin/env bash
# Optional graph-indexer. Do not start until canonical-read fixture recall passes.
set -euo pipefail

docker rm -f keto-hydradb-indexer >/dev/null 2>&1 || true

if ! docker run -d --name keto-hydradb-indexer \
  --user "$(id -u):$(id -g)" \
  -p 127.0.0.1:9091:9091 \
  -v "$PWD/.hydradb:/data" \
  -e CLOUD_PROVIDER=local \
  -e LOCAL_PATH=/data/store \
  -e GRAPH_NAMESPACE=keto \
  -e GRAPH_ID=keto \
  -e GRAPH_CELLS=cell-0 \
  --entrypoint graph-indexer \
  ghcr.io/hydra-db/hydradb:0.1.1; then
  echo "graph-indexer failed to start; record the docker error and ask HydraDB Discord" >&2
  exit 1
fi

if ! curl -fsS http://127.0.0.1:9091/readyz; then
  echo "indexer /readyz failed" >&2
  docker logs keto-hydradb-indexer >&2 || true
  exit 1
fi
