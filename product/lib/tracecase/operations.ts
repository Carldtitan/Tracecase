import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import sharp from "sharp";
import type { Artifact, AuditEvent, CaseDocument, Project, RepositoryChunk, TenantScope, User, WorkerManifest } from "./contracts";
import { artifactSchema, workerManifestSchema } from "./contracts";
import { extractExactIdentifiers } from "./retrieval";
import { authorizeProject, createOpaqueId, filterRepositoryContent, redactText, sha256, verifyManifest } from "./security";
import type { TracecaseStore } from "./store";

const codeExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java", ".rb", ".php", ".cs", ".json", ".yml", ".yaml", ".md"]);
type ScreenshotPipeline = {
  rotate(): ScreenshotPipeline;
  metadata(): Promise<{ width?: number; height?: number }>;
  composite(items: Array<{ input: { create: { width: number; height: number; channels: 4; background: { r: number; g: number; b: number; alpha: number } } }; left: number; top: number }>): ScreenshotPipeline;
  png(options: { compressionLevel: number }): ScreenshotPipeline;
  toBuffer(): Promise<Buffer>;
};
type SharpFactory = (input: Buffer, options: { failOn: "warning" }) => ScreenshotPipeline;

function contentType(path: string): RepositoryChunk["contentType"] {
  if (/test|spec/i.test(path)) return "test";
  if (/route|router|api/i.test(path)) return "route";
  if (/package\.json|lock|manifest|dockerfile|compose/i.test(path)) return "manifest";
  if (/codeowners|owners/i.test(path)) return "ownership";
  if (/release|changelog/i.test(path)) return "release";
  if (/runbook/i.test(path)) return "runbook";
  if (/decision|adr/i.test(path)) return "decision";
  return "code";
}

async function walk(root: string, current: string, output: string[]): Promise<void> {
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const absolute = join(current, entry.name);
    const path = relative(root, absolute).replaceAll("\\", "/");
    if (entry.isDirectory()) {
      if (!/(^|\/)(\.git|node_modules|dist|build|coverage|\.next)(\/|$)/i.test(path)) await walk(root, absolute, output);
    } else if (codeExtensions.has(extname(entry.name).toLowerCase()) || /dockerfile|codeowners/i.test(entry.name)) {
      output.push(absolute);
    }
  }
}

export async function indexLocalRepository(input: { root: string; repository: string; commit: string; scope: TenantScope; store: TracecaseStore }): Promise<{ indexed: number; ignored: number }> {
  const root = resolve(input.root);
  const files: string[] = [];
  await walk(root, root, files);
  const chunks: RepositoryChunk[] = [];
  let ignored = 0;
  for (const file of files) {
    const path = relative(root, file).replaceAll("\\", "/");
    const raw = (await readFile(file, "utf8")).slice(0, 200_000);
    const filtered = filterRepositoryContent(path, raw);
    if (filtered.ignored) {
      ignored += 1;
      continue;
    }
    const hash = sha256(filtered.safeContent);
    chunks.push({
      id: `chunk_${hash.slice(0, 24)}`,
      ...input.scope,
      repository: input.repository,
      commit: input.commit,
      contentType: contentType(path),
      path,
      exactIdentifiers: [...new Set([path, ...extractExactIdentifiers(filtered.safeContent)])],
      content: filtered.safeContent,
      contentHash: hash,
      ignored: false,
      indexedAt: new Date().toISOString(),
    });
  }
  await input.store.putRepositoryChunks(chunks);
  return { indexed: chunks.length, ignored };
}

export function validateWorkerManifest(manifest: unknown, secret: string): WorkerManifest {
  const parsed = workerManifestSchema.parse(manifest);
  const { signature, ...unsigned } = parsed;
  if (new Date(parsed.expiresAt).getTime() <= Date.now()) throw new Error("Worker manifest expired");
  if (!verifyManifest(unsigned, signature, secret)) throw new Error("Invalid worker manifest signature");
  if (!parsed.allowedHosts.includes(new URL(parsed.startUrl).hostname)) throw new Error("Start URL is outside the network allowlist");
  return parsed;
}

export function correlationHeaders(runId: string, workerId?: string): Record<string, string> {
  return { "x-tracecase-run-id": runId, ...(workerId ? { "x-tracecase-worker-id": workerId } : {}), traceparent: `00-${sha256(runId).slice(0, 32)}-${sha256(workerId ?? runId).slice(0, 16)}-01` };
}

export async function saveRedactedArtifact(input: { store: TracecaseStore; scope: TenantScope; runId?: string; kind: Artifact["kind"]; content: string; artifactsDir: string; retentionDays: number }): Promise<Artifact> {
  const safe = redactText(input.content);
  const bytes = Buffer.from(safe);
  const hash = sha256(bytes);
  const id = createOpaqueId("artifact");
  const root = resolve(input.artifactsDir);
  await mkdir(root, { recursive: true });
  const path = join(root, `${id}.txt`);
  await writeFile(path, safe, { encoding: "utf8", mode: 0o600 });
  const artifact = artifactSchema.parse({ id, ...input.scope, runId: input.runId, kind: input.kind, storagePath: path, sha256: hash, bytes: bytes.byteLength, redacted: true, expiresAt: new Date(Date.now() + input.retentionDays * 86_400_000).toISOString(), createdAt: new Date().toISOString() });
  await input.store.putArtifact(artifact);
  return artifact;
}

export async function sanitizeScreenshot(input: Buffer, masks: Array<{ left: number; top: number; width: number; height: number }>): Promise<Buffer> {
  if (masks.length === 0) throw new Error("Screenshot capture requires at least one explicit private-area mask");
  const sharpFactory = sharp as unknown as SharpFactory;
  const image = sharpFactory(input, { failOn: "warning" }).rotate();
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) throw new Error("Screenshot dimensions are unavailable");
  const composites = masks.map((mask) => {
    const left = Math.max(0, Math.min(metadata.width! - 1, Math.floor(mask.left)));
    const top = Math.max(0, Math.min(metadata.height! - 1, Math.floor(mask.top)));
    const width = Math.max(1, Math.min(metadata.width! - left, Math.floor(mask.width)));
    const height = Math.max(1, Math.min(metadata.height! - top, Math.floor(mask.height)));
    return { input: { create: { width, height, channels: 4 as const, background: { r: 16, g: 24, b: 20, alpha: 1 } } }, left, top };
  });
  return image.composite(composites).png({ compressionLevel: 9 }).toBuffer();
}

export async function saveRedactedBinaryArtifact(input: { store: TracecaseStore; scope: TenantScope; runId?: string; kind: Artifact["kind"]; content: Buffer; extension: string; artifactsDir: string; retentionDays: number }): Promise<Artifact> {
  const hash = sha256(input.content);
  const id = createOpaqueId("artifact");
  const root = resolve(input.artifactsDir);
  await mkdir(root, { recursive: true });
  const path = join(root, `${id}.${input.extension.replace(/[^a-z0-9]/gi, "")}`);
  await writeFile(path, input.content, { mode: 0o600 });
  const artifact = artifactSchema.parse({ id, ...input.scope, runId: input.runId, kind: input.kind, storagePath: path, sha256: hash, bytes: input.content.byteLength, redacted: true, expiresAt: new Date(Date.now() + input.retentionDays * 86_400_000).toISOString(), createdAt: new Date().toISOString() });
  await input.store.putArtifact(artifact);
  return artifact;
}

export async function deleteLocalArtifact(artifact: Artifact, allowedRoot: string): Promise<void> {
  const root = resolve(allowedRoot);
  const target = resolve(artifact.storagePath);
  if (target !== root && !target.startsWith(`${root}\\`) && !target.startsWith(`${root}/`)) throw new Error("Artifact path escaped the configured root");
  await rm(target, { force: true });
}

export async function approveCaseMerge(input: { store: TracecaseStore; project: Project; user: User; target: CaseDocument; source: CaseDocument }): Promise<CaseDocument> {
  authorizeProject(input.user, input.project, "engineer");
  if (input.target.organizationId !== input.source.organizationId || input.target.projectId !== input.source.projectId) throw new Error("Cross-tenant merge denied");
  const now = new Date().toISOString();
  const merged: CaseDocument = {
    ...input.target,
    reportIds: [...new Set([...input.target.reportIds, ...input.source.reportIds])],
    exactIdentifiers: [...new Set([...input.target.exactIdentifiers, ...input.source.exactIdentifiers])],
    unknowns: [...new Set([...input.target.unknowns, ...input.source.unknowns])],
    mergeProvenance: [...input.target.mergeProvenance, ...input.source.reportIds.map((reportId) => ({ reportId, method: "human" as const, approvedBy: input.user.id }))],
    updatedAt: now,
  };
  await input.store.putCase(merged);
  const event: AuditEvent = { id: createOpaqueId("audit"), organizationId: input.project.organizationId, projectId: input.project.id, actorId: input.user.id, action: "case.merge", target: `${input.source.id}->${input.target.id}`, result: "changed", details: { sourceReportIds: input.source.reportIds }, timestamp: now };
  await input.store.appendAuditEvent(event);
  return merged;
}

export async function updateProjectPolicy(input: { store: TracecaseStore; project: Project; user: User; policy: Partial<Project["policy"]> }): Promise<Project> {
  authorizeProject(input.user, input.project, "admin");
  const updated = { ...input.project, policy: { ...input.project.policy, ...input.policy, allowMerge: false as const, allowDeploy: false as const }, updatedAt: new Date().toISOString() };
  await input.store.putProject(updated);
  await input.store.appendAuditEvent({ id: createOpaqueId("audit"), organizationId: updated.organizationId, projectId: updated.id, actorId: input.user.id, action: "project.policy.update", target: updated.id, result: "changed", details: { changedKeys: Object.keys(input.policy) }, timestamp: updated.updatedAt });
  return updated;
}

export async function rotateWidgetKey(input: { store: TracecaseStore; project: Project; user: User }): Promise<{ project: Project; publicKey: string }> {
  authorizeProject(input.user, input.project, "admin");
  const publicKey = createOpaqueId("pk");
  const updated = { ...input.project, widget: { ...input.project.widget, publicKeyHash: sha256(publicKey) }, updatedAt: new Date().toISOString() };
  await input.store.putProject(updated);
  await input.store.appendAuditEvent({ id: createOpaqueId("audit"), organizationId: updated.organizationId, projectId: updated.id, actorId: input.user.id, action: "widget.key.rotate", target: updated.id, result: "changed", details: {}, timestamp: updated.updatedAt });
  return { project: updated, publicKey };
}

export async function grantScopedProductionAccess(input: { store: TracecaseStore; project: Project; approver: User; scope: string; reason: string; expiresAt: string }): Promise<{ grantId: string; expiresAt: string }> {
  authorizeProject(input.approver, input.project, "admin");
  if (input.project.policy.requireHumanForProductionAccess !== true) throw new Error("Project policy must keep the human approval boundary enabled");
  const expiry = new Date(input.expiresAt).getTime();
  if (!Number.isFinite(expiry) || expiry <= Date.now() || expiry > Date.now() + 60 * 60_000) throw new Error("Production access must expire within one hour");
  const grantId = createOpaqueId("access");
  await input.store.appendAuditEvent({
    id: createOpaqueId("audit"),
    organizationId: input.project.organizationId,
    projectId: input.project.id,
    actorId: input.approver.id,
    action: "production_access.grant",
    target: grantId,
    result: "allowed",
    details: { scope: input.scope, reason: input.reason, startTime: new Date().toISOString(), expiresAt: input.expiresAt },
    timestamp: new Date().toISOString(),
  });
  return { grantId, expiresAt: input.expiresAt };
}

export function buildDraftPullRequestBody(input: { caseDocument: CaseDocument; run: { id: string; outcome?: { summary: string; testedScope: string[]; uncertainty: string[] }; patch?: { regression: { path: string; baseFailed: boolean; patchPassed: boolean }; files: Array<{ path: string }> } }; evidenceBundleId: string }): string {
  const scope = input.run.outcome?.testedScope.map((item) => `- ${item}`).join("\n") || "- No environment result recorded";
  const uncertainty = input.run.outcome?.uncertainty.map((item) => `- ${item}`).join("\n") || "- None recorded";
  const files = input.run.patch?.files.map((file) => `- \`${file.path}\``).join("\n") || "- No patch files";
  return `## Tracecase evidence\n\nCase: ${input.caseDocument.id}\nRun: ${input.run.id}\nEvidence bundle: ${input.evidenceBundleId}\n\n### Reproduction\n\n${input.run.outcome?.summary ?? "No reproduction summary"}\n\n### Tested scope\n\n${scope}\n\n### Regression proof\n\n- Test: \`${input.run.patch?.regression.path ?? "not generated"}\`\n- Baseline failed: ${input.run.patch?.regression.baseFailed ?? false}\n- Patch passed: ${input.run.patch?.regression.patchPassed ?? false}\n\n### Changed files\n\n${files}\n\n### Remaining uncertainty\n\n${uncertainty}\n`;
}
