#!/usr/bin/env bash
set -euo pipefail

cd /workspace/tracecase
npm init -y >/dev/null
npm install --no-audit --no-fund @daytona/sdk@0.204.1
node orchestrator.mjs job.json

