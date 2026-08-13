import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

const suppliedPath = process.argv[2];
if (!suppliedPath) throw new Error("Provide the downloaded GitHub App PEM path");
const pemPath = isAbsolute(suppliedPath) ? suppliedPath : resolve(process.cwd(), suppliedPath);
const pem = readFileSync(pemPath, "utf8");
if (!pem.includes("-----BEGIN") || !pem.includes("PRIVATE KEY-----") || !pem.includes("-----END")) {
  throw new Error("The selected file is not a PEM private key");
}
const value = Buffer.from(pem, "utf8").toString("base64");
const key = "GITHUB_APP_PRIVATE_KEY_BASE64";

const windowsVercelCli = resolve(process.env.APPDATA ?? "", "npm", "node_modules", "vercel", "dist", "vc.js");
const executable = process.platform === "win32" && existsSync(windowsVercelCli) ? process.execPath : "vercel";
const prefix = executable === process.execPath ? [windowsVercelCli] : [];
const vercel = spawnSync(executable, [...prefix, "env", "add", key, "production", "--force", "--yes", "--sensitive"], {
  cwd: process.cwd(),
  input: value,
  encoding: "utf8",
  stdio: ["pipe", "ignore", "pipe"],
});
if (vercel.status !== 0) throw new Error(`Vercel update failed: ${String(vercel.stderr ?? vercel.error?.message ?? "unknown error").trim()}`);

for (const path of [resolve(process.cwd(), "..", ".env"), resolve(process.cwd(), ".env.local")]) {
  const current = readFileSync(path, "utf8");
  const next = new RegExp(`^${key}=.*$`, "m").test(current)
    ? current.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${value}`)
    : `${current.trimEnd()}\n${key}=${value}\n`;
  writeFileSync(path, next, { encoding: "utf8", mode: 0o600 });
}
console.log("Imported the GitHub App private key locally and into Vercel Production.");
