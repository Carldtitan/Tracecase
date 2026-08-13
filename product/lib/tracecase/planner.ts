import type { Environment, Report } from "./contracts";

export type AvailableContext = {
  sessionReplay: boolean;
  exactEnvironment: boolean;
  exactRelease: boolean;
  authenticatedState: boolean;
  telemetry: boolean;
  repository: boolean;
};

export function classifyContext(context: AvailableContext): { contextClass: "A" | "B" | "C"; reasons: string[] } {
  const reasons: string[] = [];
  if (context.sessionReplay && context.exactEnvironment && context.exactRelease && context.authenticatedState) {
    reasons.push("A replay, exact environment, release, and user state are available.");
    return { contextClass: "A", reasons };
  }
  const reporterContextCount = [context.sessionReplay, context.exactEnvironment, context.exactRelease, context.authenticatedState].filter(Boolean).length;
  if (reporterContextCount >= 2) {
    if (!context.sessionReplay) reasons.push("No session replay is available.");
    if (!context.authenticatedState) reasons.push("The reporter state is incomplete.");
    reasons.push(`${reporterContextCount} reporter-specific context sources are available.`);
    return { contextClass: "B", reasons };
  }
  reasons.push("No replay, cookies, or authenticated state are available.");
  if (context.repository) reasons.push("Repository context is available, but it does not identify the reporter environment or state.");
  else reasons.push("Repository context is not yet connected.");
  return { contextClass: "C", reasons };
}

const base = {
  viewport: { width: 1440, height: 900 },
  locale: "en-US",
  timezone: "America/Los_Angeles",
  colorScheme: "light" as const,
  networkProfile: "fast" as const,
  source: "seeded" as const,
  featureFlags: {},
  deviceProfile: "desktop" as const,
};

export function planEnvironments(contextClass: "A" | "B" | "C", report: Report, maxWorkers: number): Environment[] {
  const reported = report.environment;
  if (contextClass === "A" && reported.browser && reported.operatingSystem && reported.viewport) {
    return [{
      ...base,
      browser: reported.browser,
      operatingSystem: reported.operatingSystem,
      viewport: reported.viewport,
      locale: reported.locale ?? base.locale,
      timezone: reported.timezone ?? base.timezone,
      colorScheme: reported.colorScheme ?? base.colorScheme,
      reducedMotion: reported.reducedMotion ?? false,
      networkProfile: reported.networkProfile ?? base.networkProfile,
      stateProfile: reported.stateProfile ?? "returning-user",
      source: "reported",
    }];
  }

  const candidates: Environment[] = [
    { ...base, browser: "chromium", operatingSystem: "linux", reducedMotion: false, stateProfile: "returning-user" },
    { ...base, browser: "chromium", operatingSystem: "linux", reducedMotion: true, stateProfile: "returning-user" },
    { ...base, browser: "firefox", operatingSystem: "linux", reducedMotion: false, stateProfile: "returning-user" },
    { ...base, browser: "webkit", operatingSystem: "linux", reducedMotion: false, stateProfile: "returning-user" },
    { ...base, browser: "webkit", operatingSystem: "linux", deviceProfile: "iphone", viewport: { width: 390, height: 844 }, reducedMotion: true, stateProfile: "returning-user" },
    { ...base, browser: "chromium", operatingSystem: "linux", viewport: { width: 1366, height: 768 }, reducedMotion: false, stateProfile: "new-user" },
    { ...base, browser: "chromium", operatingSystem: "linux", deviceProfile: "android", viewport: { width: 390, height: 844 }, reducedMotion: false, stateProfile: "stale-session" },
    { ...base, browser: "firefox", operatingSystem: "linux", reducedMotion: false, networkProfile: "slow-3g", stateProfile: "anonymous" },
    { ...base, browser: "chromium", operatingSystem: "linux", colorScheme: "dark", reducedMotion: true, stateProfile: "new-user" },
    { ...base, browser: "webkit", operatingSystem: "linux", reducedMotion: true, stateProfile: "stale-session" },
  ];

  const requested = contextClass === "B" ? Math.min(4, maxWorkers) : Math.min(8, maxWorkers);
  return candidates.slice(0, requested);
}

export function shouldContinueInvestigation(input: { elapsedMinutes: number; workersUsed: number; maxMinutes: number; maxWorkers: number; unresolvedHypotheses: number; lastBatchInformationGain: number }): { continue: boolean; reason: string } {
  if (input.elapsedMinutes >= input.maxMinutes) return { continue: false, reason: "time budget reached" };
  if (input.workersUsed >= input.maxWorkers) return { continue: false, reason: "worker budget reached" };
  if (input.unresolvedHypotheses === 0) return { continue: false, reason: "no unresolved hypothesis remains" };
  if (input.lastBatchInformationGain < 0.1) return { continue: false, reason: "the last batch added too little information" };
  return { continue: true, reason: "a bounded next batch can test a distinct hypothesis" };
}

export function selectAdaptiveNextBatch(previous: Environment[], maxAdditional: number): Environment[] {
  const hasReducedMotion = previous.some((environment) => environment.reducedMotion);
  const hasSlowNetwork = previous.some((environment) => environment.networkProfile === "slow-3g");
  const candidates: Environment[] = [];
  if (!hasReducedMotion) candidates.push({ ...base, browser: "chromium", operatingSystem: "linux", reducedMotion: true, stateProfile: "returning-user" });
  if (!hasSlowNetwork) candidates.push({ ...base, browser: "firefox", operatingSystem: "linux", reducedMotion: false, networkProfile: "slow-3g", stateProfile: "returning-user" });
  return candidates.slice(0, maxAdditional);
}
