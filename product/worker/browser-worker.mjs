import { readFile, writeFile } from "node:fs/promises";
import { chromium, firefox, webkit } from "playwright";

const inputPath = process.argv[2] ?? "/workspace/tracecase/browser-job.json";
const outputPath = process.argv[3] ?? "/workspace/tracecase/browser-result.json";
const input = JSON.parse(await readFile(inputPath, "utf8"));
const started = Date.now();
const consoleEntries = [];
const networkEntries = [];
const actionTrace = [];
const artifacts = [];

function redact(value) {
  return String(value)
    .replace(/\b(?:authorization|cookie|set-cookie)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .replace(/\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*["']?[^\s,"';]+/gi, "$1=[REDACTED]")
    .replace(/mongodb(?:\+srv)?:\/\/[^\s]+/gi, "[REDACTED]")
    .slice(0, 2000);
}

function allowed(hostname) {
  const host = hostname.toLowerCase();
  return input.allowedDomains.some((entry) => {
    const candidate = entry.toLowerCase();
    return candidate.startsWith("*.") ? host === candidate.slice(2) || host.endsWith(candidate.slice(1)) : host === candidate;
  });
}

function startUrl() {
  const url = new URL(input.targetUrl);
  const path = input.plan.startPath || input.reportRoute || "/";
  return new URL(path, url).toString();
}

const browserTypes = { chromium, firefox, webkit };
const browser = await browserTypes[input.environment.browser].launch({ headless: true });
let context;
try {
  const mobile = input.environment.deviceProfile !== "desktop";
  context = await browser.newContext({
    viewport: input.environment.viewport,
    locale: input.environment.locale,
    timezoneId: input.environment.timezone,
    colorScheme: input.environment.colorScheme,
    reducedMotion: input.environment.reducedMotion ? "reduce" : "no-preference",
    isMobile: mobile,
    hasTouch: mobile,
    userAgent: input.environment.deviceProfile === "iphone"
      ? "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1"
      : input.environment.deviceProfile === "android"
        ? "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36"
        : undefined,
    offline: input.environment.networkProfile === "offline",
    recordVideo: { dir: "/workspace/tracecase/video", size: input.environment.viewport },
  });
  const page = await context.newPage();
  const video = page.video();
  page.setDefaultTimeout(Math.min(10_000, input.maxDurationMs));
  page.setDefaultNavigationTimeout(Math.min(20_000, input.maxDurationMs));
  page.on("console", (message) => consoleEntries.push({ level: message.type(), text: redact(message.text()), timestamp: new Date().toISOString() }));
  page.on("response", (response) => networkEntries.push({ method: response.request().method(), url: redact(response.url()), status: response.status() }));
  page.on("requestfailed", (request) => networkEntries.push({ method: request.method(), url: redact(request.url()), failure: redact(request.failure()?.errorText ?? "request failed") }));
  await context.route("**/*", async (route) => {
    const hostname = new URL(route.request().url()).hostname;
    if (!allowed(hostname)) return route.abort("blockedbyclient");
    if (input.environment.networkProfile === "slow-3g") await new Promise((resolve) => setTimeout(resolve, 350));
    return route.continue();
  });

  for (const [index, action] of input.plan.actions.entries()) {
    const actionStarted = Date.now();
    if (action.kind === "goto") await page.goto(action.value ? new URL(action.value, startUrl()).toString() : startUrl(), { waitUntil: "domcontentloaded" });
    if (action.kind === "click") await page.locator(action.selector).first().click();
    if (action.kind === "fill") await page.locator(action.selector).first().fill(action.value ?? "");
    if (action.kind === "press") await page.locator(action.selector ?? "body").first().press(action.value ?? "Enter");
    if (action.kind === "wait") await page.waitForTimeout(Math.min(5_000, Math.max(0, Number(action.value ?? 250))));
    actionTrace.push({ index, kind: action.kind, selector: action.selector, elapsedMs: Date.now() - actionStarted, url: redact(page.url()) });
  }

  const assertions = [];
  for (const assertion of input.plan.assertions) {
    let passed = false;
    let observed = "";
    const locator = assertion.selector ? page.locator(assertion.selector).first() : undefined;
    if (assertion.operator === "visible") {
      passed = Boolean(locator && await locator.isVisible().catch(() => false));
      observed = passed ? "visible" : "not visible";
    } else if (assertion.operator === "hidden") {
      passed = Boolean(locator && await locator.isHidden().catch(() => false));
      observed = passed ? "hidden" : "visible";
    } else if (assertion.operator === "text_contains") {
      observed = locator ? redact(await locator.textContent().catch(() => "") ?? "") : redact(await page.locator("body").innerText().catch(() => ""));
      passed = observed.toLowerCase().includes(assertion.expected.toLowerCase());
    } else if (assertion.operator === "url_contains") {
      observed = redact(page.url());
      passed = observed.includes(assertion.expected);
    } else if (assertion.operator === "value_equals") {
      observed = locator ? redact(await locator.inputValue().catch(() => "")) : "selector missing";
      passed = observed === assertion.expected;
    } else if (assertion.operator === "console_contains") {
      observed = consoleEntries.map((entry) => entry.text).join("\n").slice(0, 1000);
      passed = observed.toLowerCase().includes(assertion.expected.toLowerCase());
    } else if (assertion.operator === "request_succeeded") {
      const match = networkEntries.find((entry) => entry.url.includes(assertion.expected));
      observed = match ? `${match.method} ${match.url} ${match.status ?? match.failure}` : "request not observed";
      passed = Boolean(match?.status && match.status >= 200 && match.status < 400);
    } else {
      observed = "unsupported assertion operator";
    }
    assertions.push({ ...assertion, observed: redact(observed).slice(0, 1000), passed });
  }

  const mask = input.privateSelectors.map((selector) => page.locator(selector));
  const screenshot = await page.screenshot({ type: "jpeg", quality: 55, fullPage: false, mask, animations: "disabled" });
  artifacts.push({ workerId: input.workerId, kind: "screenshot", mimeType: "image/jpeg", contentBase64: screenshot.toString("base64") });
  await context.close();
  if (video) {
    const videoPath = await video.path().catch(() => undefined);
    if (videoPath) {
      const bytes = await readFile(videoPath).catch(() => undefined);
      if (bytes && bytes.byteLength <= 1_500_000) artifacts.push({ workerId: input.workerId, kind: "video", mimeType: "video/webm", contentBase64: bytes.toString("base64") });
    }
  }
  const status = assertions.every((assertion) => assertion.passed) ? "passed" : "failed";
  await writeFile(outputPath, JSON.stringify({ result: { workerId: input.workerId, environment: input.environment, status, assertions, console: consoleEntries.slice(0, 500), network: networkEntries.slice(0, 1000), artifactIds: [], durationMs: Date.now() - started }, artifacts, actionTrace }));
} catch (error) {
  await context?.close().catch(() => undefined);
  await writeFile(outputPath, JSON.stringify({ result: { workerId: input.workerId, environment: input.environment, status: "error", assertions: input.plan.assertions, console: consoleEntries.slice(0, 500), network: networkEntries.slice(0, 1000), artifactIds: [], error: redact(error instanceof Error ? error.message : error), durationMs: Date.now() - started }, artifacts, actionTrace }));
} finally {
  await browser.close();
}

