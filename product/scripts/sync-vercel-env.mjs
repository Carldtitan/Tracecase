import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const includeMongo = process.argv.includes("--include-mongodb");
const source = resolve(process.cwd(), ".env.local");
const values = new Map();
for (const line of readFileSync(source, "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (match && match[2]) values.set(match[1], match[2]);
}

const ignored = new Set([
  "VERCEL_OIDC_TOKEN",
  "VERCEL_GIT_COMMIT_SHA",
  ...(!includeMongo ? ["MONGODB_URI"] : []),
]);
const sensitive = new Set([
  "AUTH_SECRET",
  "AUTH_GITHUB_SECRET",
  "MONGODB_URI",
  "WIDGET_SIGNING_SECRET",
  "WORKER_SIGNING_SECRET",
  "OTEL_INGEST_SECRET",
  "CRON_SECRET",
  "MCP_API_KEY",
  "FIREWORKS_API_KEY",
  "DAYTONA_API_KEY",
  "BROWSERSTACK_ACCESS_KEY",
  "GITHUB_APP_PRIVATE_KEY_BASE64",
  "GITHUB_WEBHOOK_SECRET",
  "VERCEL_DEPLOY_HOOK_URL",
  "SENTRY_AUTH_TOKEN",
  "JIRA_API_TOKEN",
]);

let failures = 0;
const windowsVercelCli = resolve(process.env.APPDATA ?? "", "npm", "node_modules", "vercel", "dist", "vc.js");
const vercelExecutable = process.platform === "win32" && existsSync(windowsVercelCli) ? process.execPath : "vercel";
const vercelPrefix = vercelExecutable === process.execPath ? [windowsVercelCli] : [];
for (const [key, value] of values) {
  if (ignored.has(key)) continue;
  const result = spawnSync(vercelExecutable, [...vercelPrefix, "env", "add", key, "production", "--force", "--yes", sensitive.has(key) ? "--sensitive" : "--no-sensitive"], {
    cwd: process.cwd(),
    input: value,
    encoding: "utf8",
    stdio: ["pipe", "ignore", "pipe"],
  });
  if (result.status === 0) console.log(`Synced ${key}`);
  else {
    failures += 1;
    const reason = result.error?.message ?? String(result.stderr ?? "").trim().split(/\r?\n/).at(-1) ?? "unknown error";
    console.error(`Failed ${key}: ${reason}`);
  }
}
if (!includeMongo) console.log("Skipped MONGODB_URI. Rotate its exposed password, update .env.local, then rerun with --include-mongodb.");
if (failures) process.exitCode = 1;
