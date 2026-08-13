import { access, lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { spawn } from "node:child_process";
import { chromium, firefox, webkit } from "playwright";

const inputPath = process.argv[2] ?? "/workspace/tracecase/verify-job.json";
const outputPath = process.argv[3] ?? "/workspace/tracecase/verify-result.json";
const input = JSON.parse(await readFile(inputPath, "utf8"));
const repo = await realpath(input.repositoryPath ?? "/workspace/repo");

function clean(value, limit = 20_000) {
  return String(value)
    .replace(/\b(?:authorization|cookie|set-cookie)\s*[:=]\s*[^\s,;]+/gi, "[REDACTED]")
    .replace(/\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*["']?[^\s,"';]+/gi, "[REDACTED]")
    .replace(/mongodb(?:\+srv)?:\/\/[^\s]+/gi, "[REDACTED]")
    .slice(0, limit);
}

function safeCommand(command) {
  if (/[;&|`$<>\n\r]/.test(command)) return false;
  return /^(npm (test|run)|pnpm (test|run)|yarn (test|run)|bun (test|run)|npx (vitest|jest|playwright)|pytest\b|python -m pytest\b|go test\b|cargo test\b|mvn test\b|gradle test\b|\.\/gradlew test\b|dotnet test\b)/.test(command.trim());
}

async function command(command, timeoutMs = 180_000) {
  return new Promise((resolvePromise) => {
    const child = spawn(command, { cwd: repo, shell: true, env: { ...process.env, CI: "1", NODE_ENV: "test" } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout = (stdout + chunk).slice(-20_000); });
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-20_000); });
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("close", (exitCode, signal) => {
      clearTimeout(timer);
      resolvePromise({ exitCode: exitCode ?? 124, stdout: clean(stdout), stderr: clean(stderr), signal });
    });
  });
}

async function exists(path) {
  try { await access(resolve(repo, path)); return true; } catch { return false; }
}

async function safeWrite(path, content) {
  const normalized = path.replaceAll("\\", "/");
  if (normalized.startsWith("/") || normalized.includes("../") || normalized.includes("\0") || /(^|\/)\.git(\/|$)/i.test(normalized)) throw new Error(`Unsafe patch path: ${path}`);
  const target = resolve(repo, normalized);
  if (target !== repo && !target.startsWith(`${repo}${sep}`)) throw new Error(`Patch escaped repository: ${path}`);
  await mkdir(dirname(target), { recursive: true });
  try { if ((await lstat(target)).isSymbolicLink()) throw new Error(`Patch target is a symbolic link: ${path}`); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  await writeFile(target, content, { encoding: "utf8", mode: 0o600 });
}

async function reset() {
  await command("git reset --hard HEAD", 30_000);
  await command("git clean -fd", 30_000);
}

async function install() {
  if (await exists("pnpm-lock.yaml")) return command("corepack pnpm install --frozen-lockfile", 300_000);
  if (await exists("yarn.lock")) return command("corepack yarn install --immutable", 300_000);
  if (await exists("bun.lockb") || await exists("bun.lock")) return command("bun install --frozen-lockfile", 300_000);
  if (await exists("package-lock.json")) return command("npm ci --no-audit --no-fund", 300_000);
  if (await exists("package.json")) return command("npm install --no-audit --no-fund", 300_000);
  if (await exists("requirements.txt")) return command("python -m pip install -r requirements.txt", 300_000);
  return { exitCode: 0, stdout: "No supported dependency manifest was found.", stderr: "" };
}

async function waitForUrl(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { const response = await fetch(url); if (response.status < 500) return true; } catch {}
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 750));
  }
  return false;
}

async function verifyBrowser(url, plan, environment) {
  const browserTypes = { chromium, firefox, webkit };
  const browser = await browserTypes[environment.browser].launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: environment.viewport, locale: environment.locale, timezoneId: environment.timezone, colorScheme: environment.colorScheme, reducedMotion: environment.reducedMotion ? "reduce" : "no-preference" });
    const page = await context.newPage();
    for (const action of plan.actions) {
      if (action.kind === "goto") await page.goto(action.value ? new URL(action.value, url).toString() : new URL(plan.startPath || "/", url).toString());
      if (action.kind === "click") await page.locator(action.selector).first().click();
      if (action.kind === "fill") await page.locator(action.selector).first().fill(action.value ?? "");
      if (action.kind === "press") await page.locator(action.selector ?? "body").first().press(action.value ?? "Enter");
      if (action.kind === "wait") await page.waitForTimeout(Math.min(5_000, Number(action.value ?? 250)));
    }
    const results = [];
    for (const assertion of plan.assertions) {
      const locator = assertion.selector ? page.locator(assertion.selector).first() : undefined;
      let passed = false;
      if (assertion.operator === "visible") passed = Boolean(locator && await locator.isVisible().catch(() => false));
      if (assertion.operator === "hidden") passed = Boolean(locator && await locator.isHidden().catch(() => false));
      if (assertion.operator === "text_contains") passed = (locator ? await locator.textContent().catch(() => "") : await page.locator("body").innerText().catch(() => "")).toLowerCase().includes(assertion.expected.toLowerCase());
      if (assertion.operator === "url_contains") passed = page.url().includes(assertion.expected);
      if (assertion.operator === "value_equals") passed = Boolean(locator && await locator.inputValue().catch(() => "") === assertion.expected);
      results.push(passed);
    }
    await context.close();
    return results.length > 0 && results.every(Boolean);
  } finally {
    await browser.close();
  }
}

const result = { install: undefined, baseline: undefined, patched: undefined, baselineChecks: [], patchedChecks: [], diff: "", changedFiles: [], filesToCommit: [], applicationRecheckPassed: undefined, safe: false, preExistingFailures: [], error: undefined };
let server;
try {
  const plan = input.patchPlan;
  if (!safeCommand(plan.testCommand) || plan.relevantCheckCommands.some((item) => !safeCommand(item)) || (plan.startCommand && !safeCommand(plan.startCommand))) throw new Error("The model proposed a command outside the isolated verifier allowlist");
  result.install = await install();
  if (result.install.exitCode !== 0) throw new Error(`Dependency installation failed: ${result.install.stderr || result.install.stdout}`);

  for (const check of plan.relevantCheckCommands) {
    const checkResult = await command(check);
    result.baselineChecks.push({ command: check, ...checkResult });
    if (checkResult.exitCode !== 0) result.preExistingFailures.push(check);
  }

  await safeWrite(plan.regressionTest.path, plan.regressionTest.content);
  result.baseline = await command(plan.testCommand);
  const baseFailed = result.baseline.exitCode !== 0;
  await reset();

  const changes = [{ path: plan.regressionTest.path, content: plan.regressionTest.content }, ...plan.changes.map(({ path, content }) => ({ path, content }))];
  for (const file of changes) await safeWrite(file.path, file.content);
  result.patched = await command(plan.testCommand);
  const patchPassed = result.patched.exitCode === 0;
  for (const check of plan.relevantCheckCommands) result.patchedChecks.push({ command: check, ...(await command(check)) });
  const relevantTestsPassed = result.patchedChecks.every((check) => check.exitCode === 0 || result.preExistingFailures.includes(check.command));

  if (plan.startCommand && plan.localUrl && plan.verificationPlan) {
    server = spawn(plan.startCommand, { cwd: repo, shell: true, detached: true, env: { ...process.env, NODE_ENV: "production" }, stdio: "ignore" });
    if (await waitForUrl(plan.localUrl)) result.applicationRecheckPassed = await verifyBrowser(plan.localUrl, plan.verificationPlan, input.environment);
    else result.applicationRecheckPassed = false;
  }

  const diff = await command("git diff --no-ext-diff --unified=3", 30_000);
  const names = await command("git diff --name-only", 30_000);
  result.diff = clean(diff.stdout, 200_000);
  result.changedFiles = names.stdout.split(/\r?\n/).filter(Boolean).slice(0, 20);
  result.fileDiffs = [];
  for (const path of result.changedFiles) {
    const fileDiff = await command(`git diff --no-ext-diff --unified=3 -- ${path.replace(/[^A-Za-z0-9_./-]/g, "")}`, 30_000);
    result.fileDiffs.push({ path, diff: clean(fileDiff.stdout, 200_000) });
  }
  result.filesToCommit = [];
  for (const path of result.changedFiles) result.filesToCommit.push({ path, content: await readFile(resolve(repo, path), "utf8") });
  const browserProofRequired = Boolean(plan.startCommand || plan.localUrl || plan.verificationPlan);
  result.safe = Boolean(baseFailed && patchPassed && relevantTestsPassed && (!browserProofRequired || result.applicationRecheckPassed === true) && result.changedFiles.length > 0 && result.changedFiles.length <= 20);
  result.proof = { baseFailed, patchPassed, relevantTestsPassed, comparableEnvironment: true };
} catch (error) {
  result.error = clean(error instanceof Error ? error.message : error);
} finally {
  if (server?.pid) {
    try { process.kill(-server.pid, "SIGTERM"); } catch {}
  }
  await writeFile(outputPath, JSON.stringify(result));
}
