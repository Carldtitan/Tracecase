import { z } from "zod";

export const idSchema = z.string().min(3).max(96).regex(/^[a-zA-Z0-9_:-]+$/);
export const isoDateSchema = z.string().datetime();
export const roleSchema = z.enum(["owner", "admin", "engineer", "support", "viewer"]);
export const contextClassSchema = z.enum(["A", "B", "C"]);
export const runStatusSchema = z.enum([
  "queued",
  "dispatching",
  "planning",
  "running",
  "reproduced",
  "not_reproduced",
  "fixing",
  "verified",
  "diagnosis_only",
  "cancelled",
  "failed",
]);

export const tenantScopeSchema = z.object({
  organizationId: idSchema,
  projectId: idSchema,
});
export type TenantScope = z.infer<typeof tenantScopeSchema>;

export const organizationSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(120),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});
export type Organization = z.infer<typeof organizationSchema>;

export const userSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  email: z.string().email(),
  displayName: z.string().min(1).max(120),
  rolesByProject: z.record(idSchema, roleSchema),
  createdAt: isoDateSchema,
});
export type User = z.infer<typeof userSchema>;

export const invitationSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  projectId: idSchema,
  email: z.string().email(),
  role: roleSchema,
  tokenHash: z.string().length(64),
  invitedBy: idSchema,
  status: z.enum(["pending", "accepted", "revoked", "expired"]),
  expiresAt: isoDateSchema,
  createdAt: isoDateSchema,
  acceptedAt: isoDateSchema.optional(),
});
export type Invitation = z.infer<typeof invitationSchema>;

const connectionSchema = z.object({
  provider: z.enum(["github", "otel", "sentry", "jira", "daytona", "fireworks"]),
  enabled: z.boolean(),
  status: z.enum(["unconfigured", "configured", "verified", "error"]),
  externalId: z.string().max(256).optional(),
  verifiedAt: isoDateSchema.optional(),
});

export const projectSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  name: z.string().min(1).max(120),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  targetTestUrl: z.string().url(),
  repository: z.object({
    provider: z.literal("github"),
    owner: z.string().max(120),
    name: z.string().max(120),
    defaultBranch: z.string().max(120),
    installationId: z.string().optional(),
  }).optional(),
  widget: z.object({
    publicKeyHash: z.string(),
    allowedOrigins: z.array(z.string().url()).max(20),
    enabled: z.boolean(),
  }),
  policy: z.object({
    allowBranchPush: z.boolean(),
    allowDraftPullRequest: z.boolean(),
    allowMerge: z.boolean(),
    allowDeploy: z.boolean(),
    maxRunMinutes: z.number().int().min(1).max(60),
    maxParallelWorkers: z.number().int().min(1).max(24),
    requireHumanForProductionAccess: z.boolean(),
  }),
  retention: z.object({
    reportsDays: z.number().int().min(1).max(3650),
    artifactsDays: z.number().int().min(1).max(365),
    auditDays: z.number().int().min(30).max(3650),
  }),
  connections: z.array(connectionSchema).max(10),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});
export type Project = z.infer<typeof projectSchema>;

export const environmentSchema = z.object({
  browser: z.enum(["chromium", "firefox", "webkit"]),
  browserVersion: z.string().max(64).optional(),
  operatingSystem: z.enum(["linux", "windows", "macos", "android", "ios"]),
  deviceProfile: z.enum(["desktop", "iphone", "android"]).default("desktop"),
  viewport: z.object({ width: z.number().int().min(240).max(7680), height: z.number().int().min(240).max(4320) }),
  locale: z.string().max(32),
  timezone: z.string().max(64),
  colorScheme: z.enum(["light", "dark"]),
  reducedMotion: z.boolean(),
  networkProfile: z.enum(["fast", "slow-3g", "offline"]),
  stateProfile: z.enum(["anonymous", "new-user", "returning-user", "stale-session"]),
  featureFlags: z.record(z.string().max(100), z.boolean()).refine((flags) => Object.keys(flags).length <= 20, "At most 20 feature flags are allowed"),
  source: z.enum(["reported", "inferred", "seeded"]),
  executionProvider: z.enum(["daytona", "browserstack"]).optional(),
  realDevice: z.boolean().optional(),
  deviceModel: z.string().max(120).optional(),
});
export type Environment = z.infer<typeof environmentSchema>;

export const reportSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  projectId: idSchema,
  sessionId: idSchema,
  immutable: z.literal(true),
  reporter: z.object({ email: z.string().email().optional(), externalUserId: z.string().max(256).optional() }),
  expected: z.string().min(1).max(1000),
  observed: z.string().min(1).max(2000),
  frequency: z.enum(["every_time", "sometimes", "once", "unknown"]),
  route: z.string().max(2048).optional(),
  release: z.string().max(256).optional(),
  exactIdentifiers: z.array(z.string().max(512)).max(40),
  environment: environmentSchema.partial(),
  consent: z.object({ technicalDetails: z.boolean(), screenshot: z.boolean(), attachments: z.boolean() }),
  unknowns: z.array(z.string().max(300)).max(20),
  attachmentIds: z.array(idSchema).max(10),
  clarifications: z.array(z.object({ question: z.string().max(500), answer: z.string().max(2000) })).max(10).optional(),
  receivedAt: isoDateSchema,
});
export type Report = z.infer<typeof reportSchema>;

export const caseSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  projectId: idSchema,
  title: z.string().min(1).max(300),
  status: z.enum(["open", "investigating", "reproduced", "fixed", "closed"]),
  reportIds: z.array(idSchema).min(1).max(500),
  exactIdentifiers: z.array(z.string().max(512)).max(100),
  unknowns: z.array(z.string().max(300)).max(40),
  mergeProvenance: z.array(z.object({ reportId: idSchema, method: z.enum(["exact", "semantic", "human"]), score: z.number().min(0).max(1).optional(), approvedBy: idSchema.optional() })).max(500),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});
export type CaseDocument = z.infer<typeof caseSchema>;

export const hypothesisSchema = z.object({
  id: idSchema,
  statement: z.string().min(1).max(500),
  evidenceFor: z.array(z.string().max(300)).max(12),
  evidenceAgainst: z.array(z.string().max(300)).max(12),
  confidence: z.number().min(0).max(1),
});
export type Hypothesis = z.infer<typeof hypothesisSchema>;

export const observableAssertionSchema = z.object({
  id: idSchema,
  kind: z.enum(["dom", "network", "console", "visual", "application-state"]),
  description: z.string().min(1).max(500),
  expected: z.string().min(1).max(1000),
  selector: z.string().max(500).optional(),
  operator: z.enum(["visible", "hidden", "text_contains", "url_contains", "value_equals", "console_contains", "request_succeeded"]).optional(),
  observed: z.string().max(1000).optional(),
  passed: z.boolean().optional(),
});
export type ObservableAssertion = z.infer<typeof observableAssertionSchema>;

export const workerManifestSchema = z.object({
  id: idSchema,
  runId: idSchema,
  organizationId: idSchema,
  projectId: idSchema,
  environment: environmentSchema,
  startUrl: z.string().url(),
  allowedHosts: z.array(z.string().min(1).max(253)).min(1).max(20),
  actions: z.array(z.object({ kind: z.enum(["goto", "click", "fill", "wait", "press"]), selector: z.string().max(500).optional(), value: z.string().max(1000).optional() })).max(50),
  assertions: z.array(observableAssertionSchema).max(20),
  expiresAt: isoDateSchema,
  maxDurationMs: z.number().int().min(1_000).max(120_000),
  nonce: idSchema,
  signature: z.string(),
});
export type WorkerManifest = z.infer<typeof workerManifestSchema>;

export const workerResultSchema = z.object({
  workerId: idSchema,
  environment: environmentSchema,
  status: z.enum(["passed", "failed", "error", "cancelled"]),
  assertions: z.array(observableAssertionSchema),
  console: z.array(z.object({ level: z.string(), text: z.string(), timestamp: isoDateSchema })).max(500),
  network: z.array(z.object({ method: z.string(), url: z.string(), status: z.number().int().optional(), failure: z.string().optional() })).max(1000),
  artifactIds: z.array(idSchema).max(100),
  error: z.string().max(2000).optional(),
  durationMs: z.number().int().nonnegative(),
  providerSessionId: z.string().max(300).optional(),
  providerSessionUrl: z.string().url().optional(),
});
export type WorkerResult = z.infer<typeof workerResultSchema>;

export const evidenceBundleSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  projectId: idSchema,
  runId: idSchema,
  reportId: idSchema,
  baseCommit: z.string().max(64).optional(),
  assertions: z.array(observableAssertionSchema).max(100),
  workerResults: z.array(workerResultSchema).max(24),
  testedScope: z.array(z.string().max(500)).max(50),
  reproduced: z.boolean(),
  uncertainty: z.array(z.string().max(500)).max(40),
  redacted: z.literal(true),
  createdAt: isoDateSchema,
});
export type EvidenceBundle = z.infer<typeof evidenceBundleSchema>;

export const patchSchema = z.object({
  id: idSchema,
  runId: idSchema,
  baseCommit: z.string().min(7).max(64),
  files: z.array(z.object({ path: z.string().min(1).max(512), diff: z.string().max(200_000) })).min(1).max(20),
  summary: z.string().max(2000).optional(),
  regression: z.object({ path: z.string().max(512), baseFailed: z.boolean(), patchPassed: z.boolean(), comparableEnvironment: z.boolean() }),
  relevantTestsPassed: z.boolean(),
  applicationRecheckPassed: z.boolean().optional(),
  preExistingFailures: z.array(z.string().max(500)).max(50),
  safe: z.boolean(),
});
export type Patch = z.infer<typeof patchSchema>;

export const runSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  projectId: idSchema,
  caseId: idSchema,
  status: runStatusSchema,
  contextClass: contextClassSchema,
  contextReasons: z.array(z.string().max(300)).max(20),
  hypotheses: z.array(hypothesisSchema).max(12),
  environments: z.array(environmentSchema).max(24),
  workerResults: z.array(workerResultSchema).max(24),
  outcome: z.object({ reproduced: z.boolean(), summary: z.string().max(2000), testedScope: z.array(z.string().max(500)).max(50), uncertainty: z.array(z.string().max(500)).max(40) }).optional(),
  patch: patchSchema.optional(),
  review: z.object({
    provider: z.literal("github"),
    branch: z.string(),
    pullRequestNumber: z.number().int().positive().optional(),
    draftPullRequestUrl: z.string().url().optional(),
    idempotencyKey: z.string(),
    preparedOnly: z.boolean(),
    mergedAt: isoDateSchema.optional(),
    deploymentTriggeredAt: isoDateSchema.optional(),
    deploymentUrl: z.string().url().optional(),
  }).optional(),
  execution: z.object({ provider: z.literal("daytona"), sandboxId: z.string().max(200), dispatchedAt: isoDateSchema, lastHeartbeatAt: isoDateSchema.optional(), lastError: z.string().max(2000).optional() }).optional(),
  budget: z.object({ maxMinutes: z.number().int(), maxWorkers: z.number().int(), workersUsed: z.number().int(), cancelled: z.boolean() }),
  modelBundle: z.object({ provider: z.string(), model: z.string(), promptVersion: z.string(), codeVersion: z.string() }),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});
export type InvestigationRun = z.infer<typeof runSchema>;

export const runEventSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  projectId: idSchema,
  runId: idSchema,
  sequence: z.number().int().positive(),
  type: z.enum(["run.created", "run.dispatched", "agent.started", "agent.completed", "worker.started", "worker.completed", "evidence.saved", "checkpoint.saved", "run.completed", "run.failed", "review.prepared", "review.created", "review.failed", "review.merged", "deployment.triggered", "deployment.failed"]),
  agent: z.enum(["intake", "supervisor", "planner", "browser", "reproduction", "fix", "review", "system"]),
  summary: z.string().max(1000),
  data: z.record(z.string(), z.unknown()),
  timestamp: isoDateSchema,
});
export type RunEvent = z.infer<typeof runEventSchema>;

export const checkpointSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  projectId: idSchema,
  runId: idSchema,
  node: z.string().max(100),
  attempt: z.number().int().positive(),
  idempotencyKey: z.string().min(8).max(300),
  state: z.record(z.string(), z.unknown()),
  modelDecisionRecorded: z.boolean(),
  lease: z.object({ owner: z.string(), expiresAt: isoDateSchema }).optional(),
  createdAt: isoDateSchema,
});
export type RunCheckpoint = z.infer<typeof checkpointSchema>;

export const repositoryChunkSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  projectId: idSchema,
  repository: z.string(),
  commit: z.string(),
  contentType: z.enum(["code", "route", "manifest", "test", "ownership", "release", "runbook", "decision"]),
  path: z.string().max(1024),
  symbol: z.string().max(300).optional(),
  exactIdentifiers: z.array(z.string().max(512)).max(100),
  content: z.string().max(200_000),
  embedding: z.array(z.number()).max(8192).optional(),
  contentHash: z.string(),
  ignored: z.boolean(),
  indexedAt: isoDateSchema,
});
export type RepositoryChunk = z.infer<typeof repositoryChunkSchema>;

export const auditEventSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  projectId: idSchema.optional(),
  actorId: idSchema,
  action: z.string().min(1).max(200),
  target: z.string().min(1).max(500),
  result: z.enum(["allowed", "denied", "changed"]),
  details: z.record(z.string(), z.unknown()),
  timestamp: isoDateSchema,
});
export type AuditEvent = z.infer<typeof auditEventSchema>;

export const artifactSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  projectId: idSchema,
  runId: idSchema.optional(),
  sessionId: idSchema.optional(),
  workerId: idSchema.optional(),
  kind: z.enum(["screenshot", "live-frame", "video", "console", "network", "trace", "attachment", "evidence-bundle"]),
  storagePath: z.string().max(2048),
  sha256: z.string().length(64),
  bytes: z.number().int().nonnegative(),
  mimeType: z.string().max(120).optional(),
  originalName: z.string().max(255).optional(),
  redacted: z.boolean(),
  expiresAt: isoDateSchema,
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema.optional(),
});
export type Artifact = z.infer<typeof artifactSchema>;

export const intakeDraftSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  projectId: idSchema,
  sessionId: idSchema,
  projectKeyHash: z.string().length(64),
  payload: z.record(z.string(), z.unknown()),
  dueAt: isoDateSchema,
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  submittedAt: isoDateSchema.optional(),
});
export type IntakeDraft = z.infer<typeof intakeDraftSchema>;

export const intakePayloadSchema = z.object({
  projectKey: z.string().min(3).max(200),
  sessionToken: z.string().min(16).max(4096).optional(),
  expected: z.string().min(1).max(1000),
  observed: z.string().min(1).max(2000),
  frequency: z.enum(["Every time", "Sometimes", "Only happened once", "I don’t know"]),
  route: z.string().max(2048).optional(),
  release: z.string().max(256).optional(),
  environment: environmentSchema.partial().optional(),
  consent: z.object({ technicalDetails: z.boolean(), screenshot: z.boolean(), attachments: z.boolean() }),
  unknowns: z.array(z.string().max(300)).max(20).default([]),
  attachmentIds: z.array(idSchema).max(10).default([]),
  clarifications: z.array(z.object({ question: z.string().max(500), answer: z.string().max(2000) })).max(10).default([]),
});
export type IntakePayload = z.infer<typeof intakePayloadSchema>;
