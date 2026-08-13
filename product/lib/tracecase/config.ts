import { z } from "zod";

const booleanString = z.enum(["true", "false"]).default("false").transform((value) => value === "true");

const configSchema = z.object({
  runtimeMode: z.enum(["live", "test"]).default("live"),
  persistence: z.enum(["mongodb", "memory"]).default("mongodb"),
  allowExternalCalls: booleanString,
  applyMongoChanges: booleanString,
  mongodbUri: z.string().optional(),
  mongodbDatabase: z.string().default("tracecase"),
  widgetSigningSecret: z.string().min(32).optional(),
  workerSigningSecret: z.string().min(32).optional(),
  appUrl: z.string().url().optional(),
  artifactsDir: z.string().default("./.artifacts"),
  maxRunMinutes: z.coerce.number().int().min(1).max(60).default(15),
  maxParallelEnvironments: z.coerce.number().int().min(1).max(24).default(12),
  autoDispatchRuns: booleanString,
  targetAllowedDomains: z.array(z.string().min(1)).max(40).default([]),
  privateSelectors: z.array(z.string().min(1)).max(30).default(["input[type=password]", "[data-private]", "[data-tracecase-mask]"]),
  daytonaOrchestratorImage: z.string().default("node:22-bookworm"),
  daytonaBrowserImage: z.string().default("mcr.microsoft.com/playwright:v1.55.0-noble"),
  playwrightVersion: z.string().regex(/^\d+\.\d+\.\d+$/).default("1.55.0"),
});

export type TracecaseConfig = z.infer<typeof configSchema>;

export function getConfig(env: NodeJS.ProcessEnv = process.env): TracecaseConfig {
  return configSchema.parse({
    runtimeMode: env.TRACECASE_RUNTIME_MODE,
    persistence: env.TRACECASE_PERSISTENCE,
    allowExternalCalls: env.ALLOW_EXTERNAL_CALLS,
    applyMongoChanges: env.MONGODB_APPLY_CHANGES,
    mongodbUri: env.MONGODB_URI || undefined,
    mongodbDatabase: env.MONGODB_DATABASE,
    widgetSigningSecret: env.WIDGET_SIGNING_SECRET || undefined,
    workerSigningSecret: env.WORKER_SIGNING_SECRET || undefined,
    appUrl: env.NEXT_PUBLIC_APP_URL || undefined,
    artifactsDir: env.ARTIFACTS_DIR,
    maxRunMinutes: env.RUN_MAX_MINUTES,
    maxParallelEnvironments: env.MAX_PARALLEL_ENVIRONMENTS,
    autoDispatchRuns: env.AUTO_DISPATCH_RUNS,
    targetAllowedDomains: (env.TRACECASE_TARGET_ALLOWED_DOMAINS ?? "").split(",").map((value) => value.trim()).filter(Boolean),
    privateSelectors: (env.TRACECASE_PRIVATE_SELECTORS ?? "input[type=password],[data-private],[data-tracecase-mask]").split(",").map((value) => value.trim()).filter(Boolean),
    daytonaOrchestratorImage: env.DAYTONA_ORCHESTRATOR_IMAGE,
    daytonaBrowserImage: env.DAYTONA_BROWSER_IMAGE,
    playwrightVersion: env.PLAYWRIGHT_VERSION,
  });
}

export class IntegrationDisabledError extends Error {
  constructor(provider: string, reason: string) {
    super(`${provider} is disabled: ${reason}`);
    this.name = "IntegrationDisabledError";
  }
}

export function assertExternalIntegration(provider: string, requiredValues: Array<[string, string | undefined]>, config = getConfig()): void {
  if (!config.allowExternalCalls) throw new IntegrationDisabledError(provider, "ALLOW_EXTERNAL_CALLS is not true");
  if (config.runtimeMode !== "live") throw new IntegrationDisabledError(provider, "TRACECASE_RUNTIME_MODE is not live");
  const missing = requiredValues.filter(([, value]) => !value).map(([name]) => name);
  if (missing.length > 0) throw new IntegrationDisabledError(provider, `missing ${missing.join(", ")}`);
}

export function getDefaultScope(env: NodeJS.ProcessEnv = process.env) {
  const organizationId = env.TRACECASE_ORGANIZATION_ID;
  const projectId = env.TRACECASE_PROJECT_ID;
  if (!organizationId || !projectId) throw new Error("TRACECASE_ORGANIZATION_ID and TRACECASE_PROJECT_ID are required");
  return { organizationId, projectId };
}
