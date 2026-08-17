import { createSign, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const productDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rootDir = resolve(productDir, "..");
const targets = [resolve(rootDir, ".env"), resolve(productDir, ".env.local")];
const examplePath = resolve(rootDir, ".env.example");

function readEnvironment(path) {
  const values = new Map();
  const extras = new Map();
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    const match = rawLine.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) continue;
    values.set(match[1], match[2]);
    if (match[1].startsWith("VERCEL_")) extras.set(match[1], match[2]);
  }
  return { values, extras };
}

function command(name, args) {
  try {
    return execFileSync(name, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

function randomSecret(prefix = "") {
  return `${prefix}${randomBytes(32).toString("base64url")}`;
}

const sources = targets.map(readEnvironment);
const values = new Map();
// product/.env.local is the runtime source of truth. The root file is its fallback.
for (const source of [sources[1], sources[0]]) {
  for (const [key, value] of source.values) if (value && !values.get(key)) values.set(key, value);
}
if (!values.get("SUPABASE_SECRET_KEY") && values.get("NEXT_PUBLIC_SUPABASE_SECRET_KEY")) values.set("SUPABASE_SECRET_KEY", values.get("NEXT_PUBLIC_SUPABASE_SECRET_KEY"));
values.delete("NEXT_PUBLIC_SUPABASE_SECRET_KEY");

const added = [];
function setIfEmpty(key, value, generated = false) {
  if (values.get(key)) return;
  values.set(key, value);
  added.push(key + (generated ? " (generated)" : ""));
}

setIfEmpty("NEXT_PUBLIC_APP_URL", "https://tracecase.vercel.app");
setIfEmpty("AUTH_SECRET", randomSecret(), true);
setIfEmpty("AUTH_TRUST_HOST", "true");
setIfEmpty("TRACECASE_RUNTIME_MODE", "live");
setIfEmpty("TRACECASE_PERSISTENCE", "supabase");
setIfEmpty("ALLOW_EXTERNAL_CALLS", "true");
setIfEmpty("AUTO_DISPATCH_RUNS", "true");
setIfEmpty("TRACECASE_ORGANIZATION_ID", `org_${randomBytes(8).toString("hex")}`, true);
setIfEmpty("TRACECASE_ORGANIZATION_NAME", "Tracecase");
setIfEmpty("TRACECASE_ORGANIZATION_SLUG", "tracecase");
setIfEmpty("TRACECASE_PROJECT_ID", `project_${randomBytes(8).toString("hex")}`, true);
setIfEmpty("TRACECASE_PROJECT_NAME", "Tracecase");
setIfEmpty("TRACECASE_PROJECT_SLUG", "tracecase");
setIfEmpty("TRACECASE_PRIVATE_SELECTORS", "input[type=password],[data-private],[data-tracecase-mask]");
setIfEmpty("NEXT_PUBLIC_WIDGET_PROJECT_KEY", randomSecret("pk_"), true);
setIfEmpty("WIDGET_SIGNING_SECRET", randomSecret(), true);
setIfEmpty("WORKER_SIGNING_SECRET", randomSecret(), true);
setIfEmpty("OTEL_INGEST_SECRET", randomSecret(), true);
setIfEmpty("CRON_SECRET", randomSecret(), true);
setIfEmpty("MCP_API_KEY", randomSecret(), true);
setIfEmpty("GITHUB_WEBHOOK_SECRET", randomSecret(), true);
setIfEmpty("REAL_DEVICE_PROVIDER", "none");
setIfEmpty("ALLOW_AUTO_MERGE", "false");
setIfEmpty("ALLOW_AUTO_DEPLOY", "false");

const login = command("gh", ["api", "user", "--jq", ".login"]);
const primaryEmail = command("gh", ["api", "user/emails", "--jq", ".[] | select(.primary == true) | .email"]).split(/\r?\n/)[0];
if (login) setIfEmpty("TRACECASE_ALLOWED_GITHUB_LOGINS", login);
if (primaryEmail) setIfEmpty("TRACECASE_OWNER_EMAIL", primaryEmail);

const remote = command("git", ["remote", "get-url", "origin"]);
const remoteMatch = remote.match(/github\.com[/:]([^/]+)\/([^/.]+)(?:\.git)?$/i);
if (remoteMatch) {
  setIfEmpty("TRACECASE_GITHUB_REPOSITORY_OWNER", remoteMatch[1]);
  setIfEmpty("TRACECASE_GITHUB_REPOSITORY_NAME", remoteMatch[2]);
}
setIfEmpty("TRACECASE_GITHUB_DEFAULT_BRANCH", command("git", ["branch", "--show-current"]) || "main");

const appSlug = values.get("GITHUB_APP_SLUG");
if (appSlug) {
  const appJson = command("gh", ["api", `apps/${appSlug}`]);
  if (appJson) {
    const app = JSON.parse(appJson);
    if (app.id) setIfEmpty("GITHUB_APP_ID", String(app.id));
    if (app.client_id) setIfEmpty("AUTH_GITHUB_ID", String(app.client_id));
  }
  const installationsJson = command("gh", ["api", "user/installations"]);
  if (installationsJson) {
    const installations = JSON.parse(installationsJson).installations ?? [];
    const installation = installations.find((item) => item.app_slug === appSlug);
    if (installation?.id) setIfEmpty("TRACECASE_GITHUB_INSTALLATION_ID", String(installation.id));
  }
}

if (!values.get("TRACECASE_GITHUB_INSTALLATION_ID") && values.get("GITHUB_APP_ID") && values.get("GITHUB_APP_PRIVATE_KEY_BASE64")) {
  try {
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const header = encode({ alg: "RS256", typ: "JWT" });
    const payload = encode({ iat: now - 60, exp: now + 540, iss: values.get("GITHUB_APP_ID") });
    const signer = createSign("RSA-SHA256");
    signer.update(`${header}.${payload}`);
    const privateKey = Buffer.from(values.get("GITHUB_APP_PRIVATE_KEY_BASE64"), "base64").toString("utf8");
    const jwt = `${header}.${payload}.${signer.sign(privateKey, "base64url")}`;
    const response = await fetch("https://api.github.com/app/installations", { headers: { accept: "application/vnd.github+json", authorization: `Bearer ${jwt}`, "user-agent": "tracecase-env-provision", "x-github-api-version": "2022-11-28" } });
    if (response.ok) {
      const installations = await response.json();
      const owner = values.get("TRACECASE_GITHUB_REPOSITORY_OWNER")?.toLowerCase();
      const installation = Array.isArray(installations) ? installations.find((item) => item.account?.login?.toLowerCase() === owner) : undefined;
      if (installation?.id) setIfEmpty("TRACECASE_GITHUB_INSTALLATION_ID", String(installation.id));
    }
  } catch {
    // Provider values remain unresolved and are reported below.
  }
}

const example = readFileSync(examplePath, "utf8");
function renderEnvironment(extraValues) {
  const rendered = example.split(/\r?\n/).map((line) => {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) return line;
    return `${match[1]}=${values.get(match[1]) ?? match[2]}`;
  });
  for (const [key, value] of extraValues) {
    if (key === "VERCEL_GIT_COMMIT_SHA" || rendered.some((line) => line.startsWith(`${key}=`))) continue;
    rendered.push(`${key}=${value}`);
  }
  return `${rendered.join("\n").trimEnd()}\n`;
}

writeFileSync(targets[0], renderEnvironment(new Map()), { encoding: "utf8", mode: 0o600 });
writeFileSync(targets[1], renderEnvironment(sources[1].extras), { encoding: "utf8", mode: 0o600 });

const unresolved = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "AUTH_GITHUB_ID",
  "AUTH_GITHUB_SECRET",
  "GITHUB_APP_ID",
  "GITHUB_APP_PRIVATE_KEY_BASE64",
  "TRACECASE_GITHUB_INSTALLATION_ID",
  "BROWSERSTACK_USERNAME",
  "BROWSERSTACK_ACCESS_KEY",
].filter((key) => !values.get(key));

console.log(`Updated ${targets.length} ignored environment files.`);
console.log(`Added ${added.length} values: ${added.join(", ") || "none"}.`);
console.log(`Still needs provider input: ${unresolved.join(", ") || "none"}.`);
