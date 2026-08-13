import { Binary, MongoClient, type Db, type Document, type IndexDescription } from "mongodb";
import type {
  Artifact,
  AuditEvent,
  CaseDocument,
  EvidenceBundle,
  InvestigationRun,
  IntakeDraft,
  Invitation,
  Organization,
  Project,
  Report,
  RepositoryChunk,
  RunCheckpoint,
  RunEvent,
  TenantScope,
  User,
} from "./contracts";
import { getConfig, IntegrationDisabledError } from "./config";
import type { TracecaseStore } from "./store";

type CollectionPlan = {
  name: string;
  validator: Document;
  indexes: IndexDescription[];
};

const tenantRequired = ["organizationId", "projectId"];
const baseProperties = {
  organizationId: { bsonType: "string" },
  projectId: { bsonType: "string" },
};

function validator(required: string[], properties: Document): Document {
  return { $jsonSchema: { bsonType: "object", required, properties, additionalProperties: true } };
}

export const mongoCollectionPlans: CollectionPlan[] = [
  {
    name: "organizations",
    validator: validator(["id", "name", "createdAt"], { id: { bsonType: "string" }, name: { bsonType: "string" }, createdAt: { bsonType: "string" } }),
    indexes: [{ key: { id: 1 }, unique: true, name: "organization_id" }],
  },
  {
    name: "users",
    validator: validator(["id", "organizationId", "email", "rolesByProject", "createdAt"], { id: { bsonType: "string" }, organizationId: { bsonType: "string" }, email: { bsonType: "string" }, rolesByProject: { bsonType: "object" }, createdAt: { bsonType: "string" } }),
    indexes: [
      { key: { organizationId: 1, id: 1 }, unique: true, name: "tenant_user" },
      { key: { organizationId: 1, email: 1 }, unique: true, name: "tenant_user_email" },
    ],
  },
  {
    name: "invitations",
    validator: validator(["id", "organizationId", "projectId", "email", "role", "tokenHash", "status", "expiresAt"], { id: { bsonType: "string" }, organizationId: { bsonType: "string" }, projectId: { bsonType: "string" }, email: { bsonType: "string" }, role: { bsonType: "string" }, tokenHash: { bsonType: "string" }, status: { bsonType: "string" }, expiresAt: { bsonType: "string" } }),
    indexes: [
      { key: { tokenHash: 1 }, unique: true, name: "invitation_token" },
      { key: { organizationId: 1, projectId: 1, status: 1, createdAt: -1 }, name: "tenant_invitations" },
      { key: { expiresAtDate: 1 }, expireAfterSeconds: 0, name: "invitation_expiry" },
    ],
  },
  {
    name: "projects",
    validator: validator(["id", "organizationId", "name", "slug", "targetTestUrl", "widget", "policy", "retention"], { id: { bsonType: "string" }, organizationId: { bsonType: "string" }, name: { bsonType: "string" }, slug: { bsonType: "string" }, targetTestUrl: { bsonType: "string" }, widget: { bsonType: "object" }, policy: { bsonType: "object" }, retention: { bsonType: "object" } }),
    indexes: [
      { key: { organizationId: 1, id: 1 }, unique: true, name: "tenant_project" },
      { key: { "widget.publicKeyHash": 1 }, unique: true, name: "widget_key_hash" },
      { key: { organizationId: 1, slug: 1 }, unique: true, name: "tenant_project_slug" },
    ],
  },
  {
    name: "reports",
    validator: validator([...tenantRequired, "id", "immutable", "expected", "observed", "receivedAt"], { ...baseProperties, id: { bsonType: "string" }, immutable: { enum: [true] }, expected: { bsonType: "string" }, observed: { bsonType: "string" }, receivedAt: { bsonType: "string" } }),
    indexes: [
      { key: { organizationId: 1, projectId: 1, id: 1 }, unique: true, name: "tenant_report" },
      { key: { organizationId: 1, projectId: 1, receivedAt: -1 }, name: "tenant_reports_recent" },
      { key: { organizationId: 1, projectId: 1, exactIdentifiers: 1 }, name: "tenant_report_identifiers" },
    ],
  },
  {
    name: "intake_drafts",
    validator: validator([...tenantRequired, "id", "sessionId", "projectKeyHash", "payload", "dueAt"], { ...baseProperties, id: { bsonType: "string" }, sessionId: { bsonType: "string" }, projectKeyHash: { bsonType: "string" }, payload: { bsonType: "object" }, dueAt: { bsonType: "string" } }),
    indexes: [
      { key: { organizationId: 1, projectId: 1, sessionId: 1 }, unique: true, name: "tenant_intake_session" },
      { key: { submittedAt: 1, dueAt: 1 }, name: "intake_due" },
    ],
  },
  {
    name: "cases",
    validator: validator([...tenantRequired, "id", "title", "status", "reportIds"], { ...baseProperties, id: { bsonType: "string" }, title: { bsonType: "string" }, status: { bsonType: "string" }, reportIds: { bsonType: "array", maxItems: 500 } }),
    indexes: [
      { key: { organizationId: 1, projectId: 1, id: 1 }, unique: true, name: "tenant_case" },
      { key: { organizationId: 1, projectId: 1, exactIdentifiers: 1 }, name: "tenant_case_identifiers" },
      { key: { organizationId: 1, projectId: 1, status: 1, updatedAt: -1 }, name: "tenant_case_queue" },
    ],
  },
  {
    name: "runs",
    validator: validator([...tenantRequired, "id", "caseId", "status", "contextClass", "budget"], { ...baseProperties, id: { bsonType: "string" }, caseId: { bsonType: "string" }, status: { bsonType: "string" }, contextClass: { enum: ["A", "B", "C"] }, environments: { bsonType: "array", maxItems: 24 }, workerResults: { bsonType: "array", maxItems: 24 } }),
    indexes: [
      { key: { organizationId: 1, projectId: 1, id: 1 }, unique: true, name: "tenant_run" },
      { key: { organizationId: 1, projectId: 1, status: 1, updatedAt: -1 }, name: "tenant_run_wall" },
      { key: { organizationId: 1, projectId: 1, caseId: 1, createdAt: -1 }, name: "tenant_case_runs" },
    ],
  },
  {
    name: "run_events",
    validator: validator([...tenantRequired, "id", "runId", "sequence", "type", "timestamp"], { ...baseProperties, id: { bsonType: "string" }, runId: { bsonType: "string" }, sequence: { bsonType: ["int", "long", "double"] }, type: { bsonType: "string" }, timestamp: { bsonType: "string" } }),
    indexes: [
      { key: { organizationId: 1, projectId: 1, runId: 1, sequence: 1 }, unique: true, name: "tenant_run_sequence" },
      { key: { organizationId: 1, projectId: 1, id: 1 }, unique: true, name: "tenant_event" },
    ],
  },
  {
    name: "evidence_bundles",
    validator: validator([...tenantRequired, "id", "runId", "reportId", "workerResults", "testedScope", "reproduced", "redacted"], { ...baseProperties, id: { bsonType: "string" }, runId: { bsonType: "string" }, reportId: { bsonType: "string" }, workerResults: { bsonType: "array", maxItems: 24 }, testedScope: { bsonType: "array", maxItems: 50 }, reproduced: { bsonType: "bool" }, redacted: { enum: [true] } }),
    indexes: [
      { key: { organizationId: 1, projectId: 1, runId: 1 }, unique: true, name: "tenant_run_evidence" },
      { key: { organizationId: 1, projectId: 1, reportId: 1 }, name: "tenant_report_evidence" },
    ],
  },
  {
    name: "run_checkpoints",
    validator: validator([...tenantRequired, "id", "runId", "node", "idempotencyKey", "state"], { ...baseProperties, id: { bsonType: "string" }, runId: { bsonType: "string" }, node: { bsonType: "string" }, idempotencyKey: { bsonType: "string" }, state: { bsonType: "object" } }),
    indexes: [
      { key: { organizationId: 1, projectId: 1, idempotencyKey: 1 }, unique: true, name: "tenant_idempotency" },
      { key: { organizationId: 1, projectId: 1, runId: 1, createdAt: -1 }, name: "tenant_run_checkpoints" },
      { key: { "lease.expiresAt": 1 }, name: "expired_leases" },
    ],
  },
  {
    name: "run_leases",
    validator: validator([...tenantRequired, "key", "owner", "expiresAt"], { ...baseProperties, key: { bsonType: "string" }, owner: { bsonType: "string" }, expiresAt: { bsonType: "date" } }),
    indexes: [
      { key: { organizationId: 1, projectId: 1, key: 1 }, unique: true, name: "tenant_lease" },
      { key: { expiresAt: 1 }, expireAfterSeconds: 0, name: "lease_expiry" },
    ],
  },
  {
    name: "repository_chunks",
    validator: validator([...tenantRequired, "id", "repository", "commit", "contentType", "path", "contentHash"], { ...baseProperties, id: { bsonType: "string" }, repository: { bsonType: "string" }, commit: { bsonType: "string" }, contentType: { bsonType: "string" }, path: { bsonType: "string" }, contentHash: { bsonType: "string" }, embedding: { bsonType: "array", maxItems: 8192 } }),
    indexes: [
      { key: { organizationId: 1, projectId: 1, repository: 1, commit: 1, contentHash: 1 }, unique: true, name: "tenant_incremental_chunk" },
      { key: { organizationId: 1, projectId: 1, commit: 1, path: 1 }, name: "tenant_exact_path" },
      { key: { organizationId: 1, projectId: 1, commit: 1, symbol: 1 }, name: "tenant_exact_symbol" },
      { key: { organizationId: 1, projectId: 1, commit: 1, exactIdentifiers: 1 }, name: "tenant_chunk_identifiers" },
    ],
  },
  {
    name: "knowledge",
    validator: validator([...tenantRequired, "id", "contentType", "content", "source", "contentHash"], { ...baseProperties, id: { bsonType: "string" }, contentType: { enum: ["report", "runbook", "decision", "case"] }, content: { bsonType: "string" }, source: { bsonType: "object" }, contentHash: { bsonType: "string" }, embedding: { bsonType: "array", maxItems: 8192 } }),
    indexes: [
      { key: { organizationId: 1, projectId: 1, id: 1 }, unique: true, name: "tenant_knowledge" },
      { key: { organizationId: 1, projectId: 1, contentType: 1, contentHash: 1 }, unique: true, name: "tenant_knowledge_hash" },
    ],
  },
  {
    name: "artifacts",
    validator: validator([...tenantRequired, "id", "kind", "storagePath", "sha256", "redacted", "expiresAt"], { ...baseProperties, id: { bsonType: "string" }, kind: { bsonType: "string" }, storagePath: { bsonType: "string" }, sha256: { bsonType: "string" }, redacted: { bsonType: "bool" }, expiresAt: { bsonType: "string" } }),
    indexes: [
      { key: { organizationId: 1, projectId: 1, id: 1 }, unique: true, name: "tenant_artifact" },
      { key: { expiresAtDate: 1 }, expireAfterSeconds: 0, name: "artifact_retention" },
    ],
  },
  {
    name: "artifact_blobs",
    validator: validator([...tenantRequired, "artifactId", "content", "expiresAtDate"], { ...baseProperties, artifactId: { bsonType: "string" }, content: { bsonType: "binData" }, expiresAtDate: { bsonType: "date" } }),
    indexes: [{ key: { organizationId: 1, projectId: 1, artifactId: 1 }, unique: true, name: "tenant_artifact_blob" }, { key: { expiresAtDate: 1 }, expireAfterSeconds: 0, name: "artifact_blob_retention" }],
  },
  {
    name: "audit_events",
    validator: validator(["id", "organizationId", "actorId", "action", "target", "result", "timestamp"], { id: { bsonType: "string" }, organizationId: { bsonType: "string" }, projectId: { bsonType: "string" }, actorId: { bsonType: "string" }, action: { bsonType: "string" }, target: { bsonType: "string" }, result: { bsonType: "string" }, timestamp: { bsonType: "string" } }),
    indexes: [
      { key: { organizationId: 1, id: 1 }, unique: true, name: "tenant_audit" },
      { key: { organizationId: 1, projectId: 1, timestamp: -1 }, name: "tenant_audit_timeline" },
    ],
  },
];

export const atlasSearchIndexPlans = [
  {
    collection: "repository_chunks",
    name: "repo_knowledge_auto",
    type: "vectorSearch",
    definition: {
      fields: [
        { type: "autoEmbed", modality: "text", path: "content", model: "voyage-code-3" },
        ...["organizationId", "projectId", "repository", "commit", "contentType"].map((path) => ({ type: "filter", path })),
      ],
    },
  },
  {
    collection: "knowledge",
    name: "operational_memory_auto",
    type: "vectorSearch",
    definition: {
      fields: [
        { type: "autoEmbed", modality: "text", path: "content", model: "voyage-4" },
        ...["organizationId", "projectId", "contentType"].map((path) => ({ type: "filter", path })),
      ],
    },
  },
] as const;

export async function applyMongoPlan(db: Db): Promise<void> {
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((item) => item.name));
  for (const plan of mongoCollectionPlans) {
    if (!existing.has(plan.name)) await db.createCollection(plan.name, { validator: plan.validator });
    else await db.command({ collMod: plan.name, validator: plan.validator, validationLevel: "strict", validationAction: "error" });
    await db.collection(plan.name).createIndexes(plan.indexes);
  }
}

export class MongoTracecaseStore implements TracecaseStore {
  private constructor(private readonly client: MongoClient, private readonly db: Db) {}

  static async connect(): Promise<MongoTracecaseStore> {
    const config = getConfig();
    if (config.persistence !== "mongodb" || !config.mongodbUri) throw new IntegrationDisabledError("MongoDB", "TRACECASE_PERSISTENCE is not mongodb or MONGODB_URI is empty");
    const client = new MongoClient(config.mongodbUri, { appName: "tracecase-control" });
    await client.connect();
    return new MongoTracecaseStore(client, client.db(config.mongodbDatabase));
  }

  async putOrganization(organization: Organization) { await this.db.collection<Organization>("organizations").replaceOne({ id: organization.id }, organization, { upsert: true }); }
  async getOrganization(organizationId: string) { return this.db.collection<Organization>("organizations").findOne({ id: organizationId }); }
  async putUser(user: User) { await this.db.collection<User>("users").replaceOne({ organizationId: user.organizationId, email: user.email.toLowerCase() }, { ...user, email: user.email.toLowerCase() }, { upsert: true }); }
  async getUserByEmail(organizationId: string, email: string) { return this.db.collection<User>("users").findOne({ organizationId, email: email.toLowerCase() }); }
  async listUsers(organizationId: string) { return this.db.collection<User>("users").find({ organizationId }).sort({ createdAt: 1 }).toArray(); }
  async putInvitation(invitation: Invitation) { await this.db.collection("invitations").replaceOne({ tokenHash: invitation.tokenHash }, { ...invitation, expiresAtDate: new Date(invitation.expiresAt) }, { upsert: true }); }
  async getInvitationByTokenHash(tokenHash: string) { const document = await this.db.collection("invitations").findOne({ tokenHash }); if (!document) return null; return Object.fromEntries(Object.entries(document).filter(([key]) => key !== "_id" && key !== "expiresAtDate")) as unknown as Invitation; }
  async getPendingInvitationByEmail(organizationId: string, email: string) { const document = await this.db.collection("invitations").findOne({ organizationId, email: email.toLowerCase(), status: "pending", expiresAt: { $gt: new Date().toISOString() } }); if (!document) return null; return Object.fromEntries(Object.entries(document).filter(([key]) => key !== "_id" && key !== "expiresAtDate")) as unknown as Invitation; }
  async listInvitations(scope: TenantScope) { const documents = await this.db.collection("invitations").find(scope).sort({ createdAt: -1 }).toArray(); return documents.map((document) => Object.fromEntries(Object.entries(document).filter(([key]) => key !== "_id" && key !== "expiresAtDate")) as unknown as Invitation); }
  async putProject(project: Project) { await this.db.collection<Project>("projects").replaceOne({ organizationId: project.organizationId, id: project.id }, project, { upsert: true }); }
  async getProject(scope: TenantScope) { return this.db.collection<Project>("projects").findOne({ organizationId: scope.organizationId, id: scope.projectId }); }
  async getProjectByPublicKeyHash(publicKeyHash: string) { return this.db.collection<Project>("projects").findOne({ "widget.publicKeyHash": publicKeyHash }); }
  async putReport(report: Report) { await this.db.collection<Report>("reports").insertOne(report); }
  async getReport(scope: TenantScope, reportId: string) { return this.db.collection<Report>("reports").findOne({ ...scope, id: reportId }); }
  async putCase(caseDocument: CaseDocument) { await this.db.collection<CaseDocument>("cases").replaceOne({ organizationId: caseDocument.organizationId, projectId: caseDocument.projectId, id: caseDocument.id }, caseDocument, { upsert: true }); }
  async getCase(scope: TenantScope, caseId: string) { return this.db.collection<CaseDocument>("cases").findOne({ ...scope, id: caseId }); }
  async listCases(scope: TenantScope, limit = 50) { return this.db.collection<CaseDocument>("cases").find(scope).sort({ updatedAt: -1 }).limit(limit).toArray(); }
  async findCaseByExactIdentifiers(scope: TenantScope, identifiers: string[]) { return identifiers.length ? this.db.collection<CaseDocument>("cases").findOne({ ...scope, exactIdentifiers: { $in: identifiers } }) : null; }
  async putRun(run: InvestigationRun) { await this.db.collection<InvestigationRun>("runs").replaceOne({ organizationId: run.organizationId, projectId: run.projectId, id: run.id }, run, { upsert: true }); }
  async getRun(scope: TenantScope, runId: string) { return this.db.collection<InvestigationRun>("runs").findOne({ ...scope, id: runId }); }
  async listRuns(scope: TenantScope, limit = 50) { return this.db.collection<InvestigationRun>("runs").find(scope).sort({ updatedAt: -1 }).limit(limit).toArray(); }
  async appendRunEvent(event: RunEvent) { await this.db.collection<RunEvent>("run_events").updateOne({ organizationId: event.organizationId, projectId: event.projectId, runId: event.runId, sequence: event.sequence }, { $setOnInsert: event }, { upsert: true }); }
  async listRunEvents(scope: TenantScope, runId: string, afterSequence = 0) { return this.db.collection<RunEvent>("run_events").find({ ...scope, runId, sequence: { $gt: afterSequence } }).sort({ sequence: 1 }).toArray(); }
  async putEvidenceBundle(bundle: EvidenceBundle) { await this.db.collection<EvidenceBundle>("evidence_bundles").replaceOne({ organizationId: bundle.organizationId, projectId: bundle.projectId, runId: bundle.runId }, bundle, { upsert: true }); }
  async getEvidenceBundle(scope: TenantScope, runId: string) { return this.db.collection<EvidenceBundle>("evidence_bundles").findOne({ ...scope, runId }); }
  async putCheckpoint(checkpoint: RunCheckpoint) { const result = await this.db.collection<RunCheckpoint>("run_checkpoints").updateOne({ organizationId: checkpoint.organizationId, projectId: checkpoint.projectId, idempotencyKey: checkpoint.idempotencyKey }, { $setOnInsert: checkpoint }, { upsert: true }); return { inserted: result.upsertedCount === 1 }; }
  async getCheckpointByIdempotencyKey(scope: TenantScope, idempotencyKey: string) { return this.db.collection<RunCheckpoint>("run_checkpoints").findOne({ ...scope, idempotencyKey }); }
  async acquireLease(scope: TenantScope, key: string, owner: string, expiresAt: string) {
    try {
      const result = await this.db.collection("run_leases").findOneAndUpdate(
        { ...scope, key, $or: [{ expiresAt: { $lte: new Date() } }, { owner }] },
        { $set: { ...scope, key, owner, expiresAt: new Date(expiresAt) } },
        { upsert: true, returnDocument: "after" },
      );
      return result?.owner === owner;
    } catch (error) {
      if (error instanceof Error && /duplicate key/i.test(error.message)) return false;
      throw error;
    }
  }
  async releaseLease(scope: TenantScope, key: string, owner: string) { await this.db.collection("run_leases").deleteOne({ ...scope, key, owner }); }
  async putRepositoryChunks(chunks: RepositoryChunk[]) { if (!chunks.length) return; await this.db.collection<RepositoryChunk>("repository_chunks").bulkWrite(chunks.map((chunk) => ({ replaceOne: { filter: { organizationId: chunk.organizationId, projectId: chunk.projectId, repository: chunk.repository, commit: chunk.commit, contentHash: chunk.contentHash }, replacement: chunk, upsert: true } }))); }
  async findRepositoryChunksExact(scope: TenantScope, identifiers: string[], commit?: string) { return identifiers.length ? this.db.collection<RepositoryChunk>("repository_chunks").find({ ...scope, ...(commit ? { commit } : {}), ignored: false, $or: [{ path: { $in: identifiers } }, { symbol: { $in: identifiers } }, { exactIdentifiers: { $in: identifiers } }] }).limit(40).toArray() : []; }
  async findRepositoryChunksSemantic(scope: TenantScope, query: string, filters: { repository?: string; commit?: string } = {}) {
    const filter = { ...scope, ...(filters.repository ? { repository: filters.repository } : {}), ...(filters.commit ? { commit: filters.commit } : {}), contentType: { $in: ["code", "route", "test", "runbook", "decision"] } };
    return this.db.collection<RepositoryChunk>("repository_chunks").aggregate<RepositoryChunk>([
      { $vectorSearch: { index: "repo_knowledge_auto", path: "content", query, model: "voyage-code-3", numCandidates: 100, limit: 5, filter } },
      { $project: { embedding: 0, score: { $meta: "vectorSearchScore" } } },
    ]).toArray();
  }
  async putArtifact(artifact: Artifact) { await this.db.collection("artifacts").replaceOne({ organizationId: artifact.organizationId, projectId: artifact.projectId, id: artifact.id }, { ...artifact, expiresAtDate: new Date(artifact.expiresAt) }, { upsert: true }); }
  async putArtifactContent(artifact: Artifact, content: Uint8Array) {
    await this.putArtifact(artifact);
    await this.db.collection("artifact_blobs").replaceOne(
      { organizationId: artifact.organizationId, projectId: artifact.projectId, artifactId: artifact.id },
      { organizationId: artifact.organizationId, projectId: artifact.projectId, artifactId: artifact.id, content: new Binary(Buffer.from(content)), expiresAtDate: new Date(artifact.expiresAt) },
      { upsert: true },
    );
  }
  async getArtifact(scope: TenantScope, artifactId: string) { const document = await this.db.collection("artifacts").findOne({ ...scope, id: artifactId }); if (!document) return null; const artifact = Object.fromEntries(Object.entries(document).filter(([key]) => key !== "_id" && key !== "expiresAtDate")); return artifact as unknown as Artifact; }
  async getArtifactContent(scope: TenantScope, artifactId: string) {
    const document = await this.db.collection<{ content: Binary }>("artifact_blobs").findOne({ ...scope, artifactId });
    return document?.content ? new Uint8Array(document.content.buffer) : null;
  }
  async listArtifacts(scope: TenantScope, filters: { runId?: string; kind?: Artifact["kind"] } = {}) { const documents = await this.db.collection("artifacts").find({ ...scope, ...(filters.runId ? { runId: filters.runId } : {}), ...(filters.kind ? { kind: filters.kind } : {}) }).sort({ updatedAt: -1, createdAt: -1 }).toArray(); return documents.map((document) => Object.fromEntries(Object.entries(document).filter(([key]) => key !== "_id" && key !== "expiresAtDate")) as unknown as Artifact); }
  async deleteArtifact(scope: TenantScope, artifactId: string) { await Promise.all([this.db.collection("artifacts").deleteOne({ ...scope, id: artifactId }), this.db.collection("artifact_blobs").deleteOne({ ...scope, artifactId })]); }
  async putIntakeDraft(draft: IntakeDraft) { await this.db.collection<IntakeDraft>("intake_drafts").replaceOne({ organizationId: draft.organizationId, projectId: draft.projectId, sessionId: draft.sessionId }, draft, { upsert: true }); }
  async getIntakeDraftBySession(scope: TenantScope, sessionId: string) { return this.db.collection<IntakeDraft>("intake_drafts").findOne({ ...scope, sessionId }); }
  async listDueIntakeDrafts(now: string, limit = 100) { return this.db.collection<IntakeDraft>("intake_drafts").find({ submittedAt: { $exists: false }, dueAt: { $lte: now } }).sort({ dueAt: 1 }).limit(limit).toArray(); }
  async deleteIntakeDraft(scope: TenantScope, sessionId: string) { await this.db.collection<IntakeDraft>("intake_drafts").deleteOne({ ...scope, sessionId }); }
  async appendAuditEvent(event: AuditEvent) { await this.db.collection<AuditEvent>("audit_events").updateOne({ organizationId: event.organizationId, id: event.id }, { $setOnInsert: event }, { upsert: true }); }
  async dispose() { await this.client.close(); }
}
