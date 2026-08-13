import { chromium, firefox, webkit, type BrowserType } from "playwright";
import type { Environment, ObservableAssertion, WorkerManifest, WorkerResult } from "./contracts";
import { getConfig } from "./config";
import type { WorkerExecutor } from "./integrations";
import { redactText } from "./security";

export class LocalPlaywrightWorkerExecutor implements WorkerExecutor {
  async execute(manifest: WorkerManifest): Promise<WorkerResult> {
    const browserTypes: Record<Environment["browser"], BrowserType> = { chromium, firefox, webkit };
    const browser = await browserTypes[manifest.environment.browser].launch({ headless: true });
    const consoleEntries: WorkerResult["console"] = [];
    const networkEntries: WorkerResult["network"] = [];
    const started = Date.now();
    try {
      const context = await browser.newContext({
        viewport: manifest.environment.viewport,
        locale: manifest.environment.locale,
        timezoneId: manifest.environment.timezone,
        colorScheme: manifest.environment.colorScheme,
        reducedMotion: manifest.environment.reducedMotion ? "reduce" : "no-preference",
        recordVideo: { dir: getConfig().artifactsDir },
      });
      const page = await context.newPage();
      page.setDefaultTimeout(Math.min(10_000, manifest.maxDurationMs));
      page.setDefaultNavigationTimeout(Math.min(15_000, manifest.maxDurationMs));
      page.on("console", (message) => consoleEntries.push({ level: message.type(), text: redactText(message.text()), timestamp: new Date().toISOString() }));
      page.on("response", (response) => networkEntries.push({ method: response.request().method(), url: response.url(), status: response.status() }));
      page.on("requestfailed", (request) => networkEntries.push({ method: request.method(), url: request.url(), failure: request.failure()?.errorText }));
      await context.route("**/*", async (route) => {
        const hostname = new URL(route.request().url()).hostname;
        if (!manifest.allowedHosts.includes(hostname)) return route.abort("blockedbyclient");
        return route.continue();
      });
      for (const action of manifest.actions) {
        if (action.kind === "goto") await page.goto(action.value ?? manifest.startUrl);
        if (action.kind === "click" && action.selector) await page.locator(action.selector).click();
        if (action.kind === "fill" && action.selector) await page.locator(action.selector).fill(action.value ?? "");
        if (action.kind === "press" && action.selector) await page.locator(action.selector).press(action.value ?? "Enter");
        if (action.kind === "wait") await page.waitForTimeout(Math.min(5_000, Number(action.value ?? 250)));
      }
      const assertions: ObservableAssertion[] = [];
      for (const assertion of manifest.assertions) {
        const selector = assertion.expected.startsWith("selector:") ? assertion.expected.slice(9) : undefined;
        const passed = selector ? await page.locator(selector).isVisible().catch(() => false) : true;
        assertions.push({ ...assertion, observed: passed ? assertion.expected : "observable was not found", passed });
      }
      await page.screenshot({ path: `${getConfig().artifactsDir}/${manifest.id}.png`, fullPage: true });
      await context.close();
      return { workerId: manifest.id, environment: manifest.environment, status: assertions.every((assertion) => assertion.passed) ? "passed" : "failed", assertions, console: consoleEntries, network: networkEntries, artifactIds: [], durationMs: Date.now() - started };
    } catch {
      return { workerId: manifest.id, environment: manifest.environment, status: "error", assertions: manifest.assertions, console: consoleEntries, network: networkEntries, artifactIds: [], durationMs: Date.now() - started };
    } finally {
      await browser.close();
    }
  }
}
