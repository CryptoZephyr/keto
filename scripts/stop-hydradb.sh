#!/usr/bin/env bash
set -euo pipefail
docker stop keto-hydradb-indexer >/dev/null 2>&1 || true
docker stop keto-hydradb >/dev/null 2>&1 || true
echo "stopped hydradb containers"
