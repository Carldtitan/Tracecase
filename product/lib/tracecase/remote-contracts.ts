import { z } from "zod";
import {
  environmentSchema,
  hypothesisSchema,
  observableAssertionSchema,
  patchSchema,
  repositoryChunkSchema,
  workerResultSchema,
} from "./contracts";

const safeRepositoryPath = z.string().min(1).max(512).refine((value) => {
  const normalized = value.replaceAll("\\", "/");
  return /^[A-Za-z0-9_./-]+$/.test(normalized) && !normalized.startsWith("/") && !normalized.includes("../") && !normalized.includes("\0") && !/(^|\/)\.git(\/|$)/i.test(normalized);
}, "Unsafe repository path");

export const browserActionSchema = z.object({
  kind: z.enum(["goto", "click", "fill", "press", "wait"]),
  selector: z.string().max(500).optional(),
  value: z.string().max(1000).optional(),
});

export const browserPlanSchema = z.object({
  startPath: z.string().max(2048).default("/"),
  actions: z.array(browserActionSchema).max(30),
  assertions: z.array(observableAssertionSchema).min(1).max(12),
});

export const remoteJobSchema = z.object({
  version: z.literal(1),
  runId: z.string(),
  organizationId: z.string(),
  projectId: z.string(),
  repository: z.object({ owner: z.string().regex(/^[A-Za-z0-9_.-]+$/), name: z.string().regex(/^[A-Za-z0-9_.-]+$/), defaultBranch: z.string().regex(/^[A-Za-z0-9_./-]+$/).refine((value) => !value.includes("..") && !value.startsWith("/") && !value.endsWith("/")), installationId: z.string().regex(/^\d+$/) }),
  report: z.object({
    id: z.string(),
    expected: z.string(),
    observed: z.string(),
    route: z.string().optional(),
    release: z.string().optional(),
    exactIdentifiers: z.array(z.string()),
    unknowns: z.array(z.string()),
    environment: environmentSchema.partial(),
  }),
  caseDocument: z.object({ id: z.string(), title: z.string(), unknowns: z.array(z.string()) }),
  targetUrl: z.string().url(),
  targetAllowedDomains: z.array(z.string()).min(1).max(40),
  privateSelectors: z.array(z.string()).min(1).max(30),
  environments: z.array(environmentSchema).min(1).max(24),
  reporterAttachments: z.array(z.object({ id: z.string(), mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]), contentBase64: z.string().max(4_000_000) })).max(5).default([]),
  memoryContext: z.array(repositoryChunkSchema).max(10).default([]),
  budget: z.object({ maxMinutes: z.number().int().min(1).max(60), maxWorkers: z.number().int().min(1).max(24) }),
  callbackUrl: z.string().url(),
  frameCallbackUrl: z.string().url(),
  browserImage: z.string().min(1),
  playwrightVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  daytonaSecretIds: z.array(z.string()).max(6).default([]),
});
export type RemoteJob = z.infer<typeof remoteJobSchema>;

export const progressCallbackSchema = z.object({
  kind: z.literal("progress"),
  runId: z.string(),
  sequence: z.number().int().min(1000).max(99999),
  eventType: z.enum(["agent.started", "agent.completed", "worker.started", "worker.completed"]),
  agent: z.enum(["supervisor", "planner", "browser", "reproduction", "fix", "review", "system"]),
  summary: z.string().min(1).max(1000),
  data: z.record(z.string(), z.unknown()).default({}),
  timestamp: z.string().datetime(),
});

export const failedCallbackSchema = z.object({
  kind: z.literal("failed"),
  runId: z.string(),
  error: z.string().min(1).max(2000),
  phase: z.string().max(100),
  timestamp: z.string().datetime(),
});

const artifactPayloadSchema = z.object({
  workerId: z.string(),
  kind: z.enum(["screenshot", "video", "console", "network", "trace"]),
  mimeType: z.string().max(100),
  contentBase64: z.string().max(4_000_000),
});

const commitFileSchema = z.object({
  path: safeRepositoryPath,
  content: z.string().max(500_000),
});

export const completedCallbackSchema = z.object({
  kind: z.literal("completed"),
  runId: z.string(),
  baseCommit: z.string().min(7).max(64),
  hypotheses: z.array(hypothesisSchema).max(12),
  environments: z.array(environmentSchema).max(24),
  workerResults: z.array(workerResultSchema).max(24),
  outcome: z.object({
    reproduced: z.boolean(),
    summary: z.string().max(2000),
    testedScope: z.array(z.string().max(500)).max(50),
    uncertainty: z.array(z.string().max(500)).max(40),
  }),
  patch: patchSchema.optional(),
  filesToCommit: z.array(commitFileSchema).max(20).default([]),
  repositoryChunks: z.array(repositoryChunkSchema).max(40).default([]),
  artifacts: z.array(artifactPayloadSchema).max(8).default([]),
  timestamp: z.string().datetime(),
});

export const remoteCallbackSchema = z.discriminatedUnion("kind", [progressCallbackSchema, failedCallbackSchema, completedCallbackSchema]);
export type RemoteCallback = z.infer<typeof remoteCallbackSchema>;

export const remotePlanSchema = z.object({
  hypotheses: z.array(z.string().min(1).max(500)).min(1).max(8),
  filesToRead: z.array(safeRepositoryPath).max(30),
  searchTerms: z.array(z.string().min(2).max(120)).max(12),
  browserPlan: browserPlanSchema,
});

export const remotePatchPlanSchema = z.object({
  diagnosis: z.string().min(1).max(2000),
  confidence: z.number().min(0).max(1),
  regressionTest: z.object({ path: safeRepositoryPath, content: z.string().min(1).max(500_000) }),
  changes: z.array(z.object({ path: safeRepositoryPath, content: z.string().min(1).max(500_000), reason: z.string().max(500) })).min(1).max(19),
  testCommand: z.string().min(1).max(500),
  relevantCheckCommands: z.array(z.string().min(1).max(500)).max(4),
  startCommand: z.string().max(500).optional(),
  localUrl: z.string().url().optional(),
  verificationPlan: browserPlanSchema.optional(),
});
export type RemotePatchPlan = z.infer<typeof remotePatchPlanSchema>;
