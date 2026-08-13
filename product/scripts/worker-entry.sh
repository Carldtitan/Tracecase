#!/usr/bin/env bash
set -euo pipefail

manifest_path="${1:-worker-manifest.json}"
output_path="${2:-worker-result.json}"

if [[ -z "${WORKER_SIGNING_SECRET:-}" ]]; then
  echo "WORKER_SIGNING_SECRET is required" >&2
  exit 2
fi

if [[ ! -f "$manifest_path" ]]; then
  echo "Worker manifest not found: $manifest_path" >&2
  exit 2
fi

npm ci --ignore-scripts
npx playwright install --with-deps chromium firefox webkit
npx tsx scripts/worker-run.ts "$manifest_path" "$output_path"
