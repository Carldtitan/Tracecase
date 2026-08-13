import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const allowed = new Set([
  "AUTH_SECRET",
  "WIDGET_SIGNING_SECRET",
  "WORKER_SIGNING_SECRET",
  "OTEL_INGEST_SECRET",
  "CRON_SECRET",
  "MCP_API_KEY",
  "GITHUB_WEBHOOK_SECRET",
]);
const key = process.argv[2];
if (!allowed.has(key)) throw new Error(`Secret name is not allowed: ${key ?? "missing"}`);

const productDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rootDir = resolve(productDir, "..");
const value = randomBytes(32).toString("base64url");

const windowsVercelCli = resolve(process.env.APPDATA ?? "", "npm", "node_modules", "vercel", "dist", "vc.js");
const executable = process.platform === "win32" && existsSync(windowsVercelCli) ? process.execPath : "vercel";
const prefix = executable === process.execPath ? [windowsVercelCli] : [];
const vercel = spawnSync(executable, [...prefix, "env", "add", key, "production", "--force", "--yes", "--sensitive"], {
  cwd: productDir,
  input: value,
  encoding: "utf8",
  stdio: ["pipe", "ignore", "pipe"],
});
if (vercel.status !== 0) throw new Error(`Vercel update failed: ${String(vercel.stderr ?? vercel.error?.message ?? "unknown error").trim()}`);

for (const path of [resolve(rootDir, ".env"), resolve(productDir, ".env.local")]) {
  const current = readFileSync(path, "utf8");
  const next = new RegExp(`^${key}=.*$`, "m").test(current)
    ? current.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${value}`)
    : `${current.trimEnd()}\n${key}=${value}\n`;
  writeFileSync(path, next, { encoding: "utf8", mode: 0o600 });
}

if (process.platform === "win32") {
  const clipboard = spawnSync("clip.exe", { input: value, encoding: "utf8", stdio: ["pipe", "ignore", "pipe"] });
  if (clipboard.status !== 0) throw new Error("Secret rotated, but copying it to the clipboard failed");
}
console.log(`Rotated ${key} locally and in Vercel Production. The new value is in the clipboard.`);
