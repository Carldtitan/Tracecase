import type {
  Artifact,
  AuditEvent,
  CaseDocument,
  EvidenceBundle,
  InvestigationRun,
  Project,
  Report,
  RepositoryChunk,
  RunCheckpoint,
  RunEvent,
  TenantScope,
} from "./contracts";

export interface TracecaseStore {
  putProject(project: Project): Promise<void>;
  getProject(scope: TenantScope): Promise<Project | null>;
  getProjectByPublicKeyHash(publicKeyHash: string): Promise<Project | null>;
  putReport(report: Report): Promise<void>;
  getReport(scope: TenantScope, reportId: string): Promise<Report | null>;
  putCase(caseDocument: CaseDocument): Promise<void>;
  getCase(scope: TenantScope, caseId: string): Promise<CaseDocument | null>;
  listCases(scope: TenantScope, limit?: number): Promise<CaseDocument[]>;
  findCaseByExactIdentifiers(scope: TenantScope, identifiers: string[]): Promise<CaseDocument | null>;
  putRun(run: InvestigationRun): Promise<void>;
  getRun(scope: TenantScope, runId: string): Promise<InvestigationRun | null>;
  listRuns(scope: TenantScope, limit?: number): Promise<InvestigationRun[]>;
  appendRunEvent(event: RunEvent): Promise<void>;
  listRunEvents(scope: TenantScope, runId: string, afterSequence?: number): Promise<RunEvent[]>;
  putEvidenceBundle(bundle: EvidenceBundle): Promise<void>;
  getEvidenceBundle(scope: TenantScope, runId: string): Promise<EvidenceBundle | null>;
  putCheckpoint(checkpoint: RunCheckpoint): Promise<{ inserted: boolean }>;
  getCheckpointByIdempotencyKey(scope: TenantScope, idempotencyKey: string): Promise<RunCheckpoint | null>;
  acquireLease(scope: TenantScope, key: string, owner: string, expiresAt: string): Promise<boolean>;
  releaseLease(scope: TenantScope, key: string, owner: string): Promise<void>;
  putRepositoryChunks(chunks: RepositoryChunk[]): Promise<void>;
  findRepositoryChunksExact(scope: TenantScope, identifiers: string[], commit?: string): Promise<RepositoryChunk[]>;
  putArtifact(artifact: Artifact): Promise<void>;
  putArtifactContent(artifact: Artifact, content: Uint8Array): Promise<void>;
  getArtifact(scope: TenantScope, artifactId: string): Promise<Artifact | null>;
  getArtifactContent(scope: TenantScope, artifactId: string): Promise<Uint8Array | null>;
  deleteArtifact(scope: TenantScope, artifactId: string): Promise<void>;
  appendAuditEvent(event: AuditEvent): Promise<void>;
  dispose(): Promise<void>;
}

function scopedKey(scope: TenantScope, id: string): string {
  return `${scope.organizationId}:${scope.projectId}:${id}`;
}

export class MemoryTracecaseStore implements TracecaseStore {
  private readonly projects = new Map<string, Project>();
  private readonly reports = new Map<string, Report>();
  private readonly cases = new Map<string, CaseDocument>();
  private readonly runs = new Map<string, InvestigationRun>();
  private readonly events = new Map<string, RunEvent[]>();
  private readonly evidence = new Map<string, EvidenceBundle>();
  private readonly checkpoints = new Map<string, RunCheckpoint>();
  private readonly leases = new Map<string, { owner: string; expiresAt: string }>();
  private readonly chunks = new Map<string, RepositoryChunk>();
  private readonly artifacts = new Map<string, Artifact>();
  private readonly artifactContents = new Map<string, Uint8Array>();
  private readonly audits = new Map<string, AuditEvent>();

  async putProject(project: Project): Promise<void> {
    this.projects.set(scopedKey({ organizationId: project.organizationId, projectId: project.id }, project.id), structuredClone(project));
  }

  async getProject(scope: TenantScope): Promise<Project | null> {
    return structuredClone(this.projects.get(scopedKey(scope, scope.projectId)) ?? null);
  }

  async getProjectByPublicKeyHash(publicKeyHash: string): Promise<Project | null> {
    const found = [...this.projects.values()].find((project) => project.widget.publicKeyHash === publicKeyHash);
    return structuredClone(found ?? null);
  }

  async putReport(report: Report): Promise<void> {
    const key = scopedKey(report, report.id);
    if (this.reports.has(key)) throw new Error("Reports are immutable");
    this.reports.set(key, structuredClone(report));
  }

  async getReport(scope: TenantScope, reportId: string): Promise<Report | null> {
    return structuredClone(this.reports.get(scopedKey(scope, reportId)) ?? null);
  }

  async putCase(caseDocument: CaseDocument): Promise<void> {
    this.cases.set(scopedKey(caseDocument, caseDocument.id), structuredClone(caseDocument));
  }

  async getCase(scope: TenantScope, caseId: string): Promise<CaseDocument | null> {
    return structuredClone(this.cases.get(scopedKey(scope, caseId)) ?? null);
  }

  async listCases(scope: TenantScope, limit = 50): Promise<CaseDocument[]> {
    return structuredClone([...this.cases.values()].filter((item) => item.organizationId === scope.organizationId && item.projectId === scope.projectId).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, limit));
  }

  async findCaseByExactIdentifiers(scope: TenantScope, identifiers: string[]): Promise<CaseDocument | null> {
    if (identifiers.length === 0) return null;
    const wanted = new Set(identifiers);
    const found = [...this.cases.values()].find((item) => item.organizationId === scope.organizationId && item.projectId === scope.projectId && item.exactIdentifiers.some((identifier) => wanted.has(identifier)));
    return structuredClone(found ?? null);
  }

  async putRun(run: InvestigationRun): Promise<void> {
    this.runs.set(scopedKey(run, run.id), structuredClone(run));
  }

  async getRun(scope: TenantScope, runId: string): Promise<InvestigationRun | null> {
    return structuredClone(this.runs.get(scopedKey(scope, runId)) ?? null);
  }

  async listRuns(scope: TenantScope, limit = 50): Promise<InvestigationRun[]> {
    return structuredClone([...this.runs.values()].filter((item) => item.organizationId === scope.organizationId && item.projectId === scope.projectId).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, limit));
  }

  async appendRunEvent(event: RunEvent): Promise<void> {
    const key = scopedKey(event, event.runId);
    const current = this.events.get(key) ?? [];
    if (current.some((item) => item.id === event.id || item.sequence === event.sequence)) return;
    current.push(structuredClone(event));
    current.sort((left, right) => left.sequence - right.sequence);
    this.events.set(key, current);
  }

  async listRunEvents(scope: TenantScope, runId: string, afterSequence = 0): Promise<RunEvent[]> {
    return structuredClone((this.events.get(scopedKey(scope, runId)) ?? []).filter((event) => event.sequence > afterSequence));
  }

  async putEvidenceBundle(bundle: EvidenceBundle): Promise<void> {
    this.evidence.set(scopedKey(bundle, bundle.runId), structuredClone(bundle));
  }

  async getEvidenceBundle(scope: TenantScope, runId: string): Promise<EvidenceBundle | null> {
    return structuredClone(this.evidence.get(scopedKey(scope, runId)) ?? null);
  }

  async putCheckpoint(checkpoint: RunCheckpoint): Promise<{ inserted: boolean }> {
    const key = scopedKey(checkpoint, checkpoint.idempotencyKey);
    if (this.checkpoints.has(key)) return { inserted: false };
    this.checkpoints.set(key, structuredClone(checkpoint));
    return { inserted: true };
  }

  async getCheckpointByIdempotencyKey(scope: TenantScope, idempotencyKey: string): Promise<RunCheckpoint | null> {
    return structuredClone(this.checkpoints.get(scopedKey(scope, idempotencyKey)) ?? null);
  }

  async acquireLease(scope: TenantScope, key: string, owner: string, expiresAt: string): Promise<boolean> {
    const scoped = scopedKey(scope, key);
    const current = this.leases.get(scoped);
    if (current && current.owner !== owner && new Date(current.expiresAt).getTime() > Date.now()) return false;
    this.leases.set(scoped, { owner, expiresAt });
    return true;
  }

  async releaseLease(scope: TenantScope, key: string, owner: string): Promise<void> {
    const scoped = scopedKey(scope, key);
    if (this.leases.get(scoped)?.owner === owner) this.leases.delete(scoped);
  }

  async putRepositoryChunks(chunks: RepositoryChunk[]): Promise<void> {
    for (const chunk of chunks) this.chunks.set(scopedKey(chunk, chunk.id), structuredClone(chunk));
  }

  async findRepositoryChunksExact(scope: TenantScope, identifiers: string[], commit?: string): Promise<RepositoryChunk[]> {
    const wanted = new Set(identifiers);
    return structuredClone([...this.chunks.values()].filter((chunk) =>
      chunk.organizationId === scope.organizationId &&
      chunk.projectId === scope.projectId &&
      !chunk.ignored &&
      (!commit || chunk.commit === commit) &&
      (wanted.has(chunk.path) || Boolean(chunk.symbol && wanted.has(chunk.symbol)) || chunk.exactIdentifiers.some((identifier) => wanted.has(identifier)))
    ));
  }

  async putArtifact(artifact: Artifact): Promise<void> {
    this.artifacts.set(scopedKey(artifact, artifact.id), structuredClone(artifact));
  }

  async putArtifactContent(artifact: Artifact, content: Uint8Array): Promise<void> {
    await this.putArtifact(artifact);
    this.artifactContents.set(scopedKey(artifact, artifact.id), Uint8Array.from(content));
  }

  async getArtifact(scope: TenantScope, artifactId: string): Promise<Artifact | null> {
    return structuredClone(this.artifacts.get(scopedKey(scope, artifactId)) ?? null);
  }


  async getArtifactContent(scope: TenantScope, artifactId: string): Promise<Uint8Array | null> {
    const content = this.artifactContents.get(scopedKey(scope, artifactId));
    return content ? Uint8Array.from(content) : null;
  }

  async deleteArtifact(scope: TenantScope, artifactId: string): Promise<void> {
    this.artifacts.delete(scopedKey(scope, artifactId));
    this.artifactContents.delete(scopedKey(scope, artifactId));
  }

  async appendAuditEvent(event: AuditEvent): Promise<void> {
    this.audits.set(`${event.organizationId}:${event.id}`, structuredClone(event));
  }

  async dispose(): Promise<void> {}
}

declare global {
  var __tracecaseMemoryStore: MemoryTracecaseStore | undefined;
}

export function getProcessMemoryStore(): MemoryTracecaseStore {
  globalThis.__tracecaseMemoryStore ??= new MemoryTracecaseStore();
  return globalThis.__tracecaseMemoryStore;
}
