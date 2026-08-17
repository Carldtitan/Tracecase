import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  Artifact, AuditEvent, CaseDocument, EvidenceBundle, InvestigationRun, IntakeDraft,
  Invitation, Organization, Project, Report, RepositoryChunk, RunCheckpoint, RunEvent,
  TenantScope, User,
} from "./contracts";
import { getConfig, IntegrationDisabledError } from "./config";
import type { TracecaseStore } from "./store";

type EntityType = "organization" | "user" | "invitation" | "project" | "report" | "case" | "run" | "run_event" | "evidence_bundle" | "checkpoint" | "repository_chunk" | "artifact" | "intake_draft" | "audit_event";
type Metadata = Partial<{
  run_id: string; session_id: string; email: string; token_hash: string; public_key_hash: string;
  idempotency_key: string; repository: string; commit_sha: string; content_hash: string;
  status: string; exact_identifiers: string[]; due_at: string; sort_at: string;
  content_text: string; embedding: number[] | null;
}>;

function rowKey(entity: EntityType, organizationId: string, projectId: string, naturalId: string) {
  return [entity, organizationId, projectId || "_", naturalId].join(":");
}

function storageKey(artifact: Artifact) {
  return `${artifact.organizationId}/${artifact.projectId}/${artifact.id}`;
}

function message(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return String(error);
}

async function requestEmbeddings(inputs: string[]): Promise<Array<number[] | null>> {
  if (!inputs.length || !process.env.FIREWORKS_API_KEY) return inputs.map(() => null);
  const base = (process.env.FIREWORKS_BASE_URL ?? "https://api.fireworks.ai/inference/v1").replace(/\/+$/, "").replace(/\/chat\/completions$/, "");
  try {
    const response = await fetch(`${base}/embeddings`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.FIREWORKS_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.FIREWORKS_EMBEDDING_MODEL ?? "nomic-ai/nomic-embed-text-v1.5",
        input: inputs.map((value) => value.slice(0, 24_000)),
        dimensions: 768,
        normalize: true,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Fireworks embeddings returned HTTP ${response.status}`);
    const payload = await response.json() as { data?: Array<{ index: number; embedding: number[] }> };
    const byIndex = new Map((payload.data ?? []).map((item) => [item.index, item.embedding]));
    return inputs.map((_, index) => byIndex.get(index) ?? null);
  } catch (error) {
    console.warn("Tracecase embedding generation unavailable; PostgreSQL full-text retrieval remains active.", { error: message(error) });
    return inputs.map(() => null);
  }
}

export class SupabaseTracecaseStore implements TracecaseStore {
  private constructor(private readonly client: SupabaseClient) {}

  static async connect(): Promise<SupabaseTracecaseStore> {
    const config = getConfig();
    if (config.persistence !== "supabase" || !config.supabaseUrl || !config.supabaseSecretKey) {
      throw new IntegrationDisabledError("Supabase", "TRACECASE_PERSISTENCE is not supabase or server credentials are empty");
    }
    return new SupabaseTracecaseStore(createClient(config.supabaseUrl, config.supabaseSecretKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      global: { headers: { "X-Client-Info": "tracecase-control/1" } },
    }));
  }

  private async write<T extends Record<string, unknown>>(entity: EntityType, document: T, naturalId: string, metadata: Metadata = {}, insertOnly = false): Promise<boolean> {
    const organizationId = String(document.organizationId ?? document.id ?? "system");
    const projectId = String(document.projectId ?? "");
    const payload = {
      row_key: rowKey(entity, organizationId, projectId, naturalId), entity_type: entity,
      id: String(document.id), organization_id: organizationId, project_id: projectId,
      document, updated_at: new Date().toISOString(), ...metadata,
    };
    const query = insertOnly ? this.client.from("tracecase_documents").insert(payload) : this.client.from("tracecase_documents").upsert(payload, { onConflict: "row_key" });
    const { error } = await query;
    if (error) {
      if (insertOnly && error.code === "23505") return false;
      throw new Error(`Supabase ${entity} write failed: ${error.message}`);
    }
    return true;
  }

  private async one<T>(query: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T | null> {
    const { data, error } = await query;
    if (error) throw new Error(`Supabase read failed: ${error.message}`);
    if (!data) return null;
    return ((data as { document?: T }).document ?? data) as T;
  }

  private async many<T>(query: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
    const { data, error } = await query;
    if (error) throw new Error(`Supabase list failed: ${error.message}`);
    return ((data ?? []) as Array<{ document?: T }>).map((row) => row.document ?? row as T);
  }

  async putOrganization(value: Organization) { await this.write("organization", value, value.id, { sort_at: value.updatedAt }); }
  async getOrganization(id: string) { return this.one<Organization>(this.client.from("tracecase_documents").select("document").eq("row_key", rowKey("organization", id, "", id)).maybeSingle()); }
  async putUser(value: User) { const normalized = { ...value, email: value.email.toLowerCase() }; await this.write("user", normalized, normalized.email, { email: normalized.email, sort_at: normalized.createdAt }); }
  async getUserByEmail(organizationId: string, email: string) { return this.one<User>(this.client.from("tracecase_documents").select("document").eq("entity_type", "user").eq("organization_id", organizationId).eq("email", email.toLowerCase()).maybeSingle()); }
  async listUsers(organizationId: string) { return this.many<User>(this.client.from("tracecase_documents").select("document").eq("entity_type", "user").eq("organization_id", organizationId).order("sort_at")); }
  async putInvitation(value: Invitation) { await this.write("invitation", { ...value, email: value.email.toLowerCase() }, value.tokenHash, { email: value.email.toLowerCase(), token_hash: value.tokenHash, status: value.status, due_at: value.expiresAt, sort_at: value.createdAt }); }
  async getInvitationByTokenHash(tokenHash: string) { return this.one<Invitation>(this.client.from("tracecase_documents").select("document").eq("entity_type", "invitation").eq("token_hash", tokenHash).maybeSingle()); }
  async getPendingInvitationByEmail(organizationId: string, email: string) { return this.one<Invitation>(this.client.from("tracecase_documents").select("document").eq("entity_type", "invitation").eq("organization_id", organizationId).eq("email", email.toLowerCase()).eq("status", "pending").gt("due_at", new Date().toISOString()).maybeSingle()); }
  async listInvitations(scope: TenantScope) { return this.many<Invitation>(this.client.from("tracecase_documents").select("document").eq("entity_type", "invitation").eq("organization_id", scope.organizationId).eq("project_id", scope.projectId).order("sort_at", { ascending: false })); }
  async putProject(value: Project) { await this.write("project", value, value.id, { public_key_hash: value.widget.publicKeyHash, sort_at: value.updatedAt }); }
  async getProject(scope: TenantScope) { return this.one<Project>(this.client.from("tracecase_documents").select("document").eq("row_key", rowKey("project", scope.organizationId, "", scope.projectId)).maybeSingle()); }
  async getProjectByPublicKeyHash(hash: string) { return this.one<Project>(this.client.from("tracecase_documents").select("document").eq("entity_type", "project").eq("public_key_hash", hash).maybeSingle()); }
  async putReport(value: Report) { const inserted = await this.write("report", value, value.id, { exact_identifiers: value.exactIdentifiers, sort_at: value.receivedAt, content_text: `${value.expected}\n${value.observed}` }, true); if (!inserted) throw new Error("Reports are immutable"); }
  async getReport(scope: TenantScope, id: string) { return this.one<Report>(this.client.from("tracecase_documents").select("document").eq("row_key", rowKey("report", scope.organizationId, scope.projectId, id)).maybeSingle()); }
  async putCase(value: CaseDocument) { await this.write("case", value, value.id, { exact_identifiers: value.exactIdentifiers, status: value.status, sort_at: value.updatedAt, content_text: value.title }); }
  async getCase(scope: TenantScope, id: string) { return this.one<CaseDocument>(this.client.from("tracecase_documents").select("document").eq("row_key", rowKey("case", scope.organizationId, scope.projectId, id)).maybeSingle()); }
  async listCases(scope: TenantScope, limit = 50) { return this.many<CaseDocument>(this.client.from("tracecase_documents").select("document").eq("entity_type", "case").eq("organization_id", scope.organizationId).eq("project_id", scope.projectId).order("sort_at", { ascending: false }).limit(limit)); }
  async findCaseByExactIdentifiers(scope: TenantScope, ids: string[]) { return ids.length ? this.one<CaseDocument>(this.client.from("tracecase_documents").select("document").eq("entity_type", "case").eq("organization_id", scope.organizationId).eq("project_id", scope.projectId).overlaps("exact_identifiers", ids).limit(1).maybeSingle()) : null; }
  async putRun(value: InvestigationRun) { await this.write("run", value, value.id, { status: value.status, sort_at: value.updatedAt }); }
  async getRun(scope: TenantScope, id: string) { return this.one<InvestigationRun>(this.client.from("tracecase_documents").select("document").eq("row_key", rowKey("run", scope.organizationId, scope.projectId, id)).maybeSingle()); }
  async listRuns(scope: TenantScope, limit = 50) { return this.many<InvestigationRun>(this.client.from("tracecase_documents").select("document").eq("entity_type", "run").eq("organization_id", scope.organizationId).eq("project_id", scope.projectId).order("sort_at", { ascending: false }).limit(limit)); }
  async appendRunEvent(value: RunEvent) { await this.write("run_event", value, `${value.runId}:${value.sequence}`, { run_id: value.runId, sort_at: value.timestamp }, true); }
  async listRunEvents(scope: TenantScope, runId: string, after = 0) { const rows = await this.many<RunEvent>(this.client.from("tracecase_documents").select("document").eq("entity_type", "run_event").eq("organization_id", scope.organizationId).eq("project_id", scope.projectId).eq("run_id", runId).order("sort_at")); return rows.filter((event) => event.sequence > after); }
  async putEvidenceBundle(value: EvidenceBundle) { await this.write("evidence_bundle", value, value.runId, { run_id: value.runId, sort_at: value.createdAt }); }
  async getEvidenceBundle(scope: TenantScope, runId: string) { return this.one<EvidenceBundle>(this.client.from("tracecase_documents").select("document").eq("row_key", rowKey("evidence_bundle", scope.organizationId, scope.projectId, runId)).maybeSingle()); }
  async putCheckpoint(value: RunCheckpoint) { const inserted = await this.write("checkpoint", value, value.idempotencyKey, { run_id: value.runId, idempotency_key: value.idempotencyKey, sort_at: value.createdAt }, true); return { inserted }; }
  async getCheckpointByIdempotencyKey(scope: TenantScope, key: string) { return this.one<RunCheckpoint>(this.client.from("tracecase_documents").select("document").eq("entity_type", "checkpoint").eq("organization_id", scope.organizationId).eq("project_id", scope.projectId).eq("idempotency_key", key).maybeSingle()); }
  async acquireLease(scope: TenantScope, key: string, owner: string, expiresAt: string) { const { data, error } = await this.client.rpc("tracecase_acquire_lease", { p_organization_id: scope.organizationId, p_project_id: scope.projectId, p_lease_key: key, p_owner: owner, p_expires_at: expiresAt }); if (error) throw new Error(`Supabase lease failed: ${error.message}`); return data === true; }
  async releaseLease(scope: TenantScope, key: string, owner: string) { const { error } = await this.client.from("tracecase_leases").delete().eq("organization_id", scope.organizationId).eq("project_id", scope.projectId).eq("lease_key", key).eq("owner", owner); if (error) throw new Error(`Supabase lease release failed: ${error.message}`); }

  async putRepositoryChunks(chunks: RepositoryChunk[]) {
    for (let offset = 0; offset < chunks.length; offset += 24) {
      const batch = chunks.slice(offset, offset + 24);
      const embeddings = await requestEmbeddings(batch.map((chunk) => chunk.content));
      const rows = batch.map((chunk, index) => ({
        row_key: rowKey("repository_chunk", chunk.organizationId, chunk.projectId, `${chunk.repository}:${chunk.commit}:${chunk.contentHash}`),
        entity_type: "repository_chunk", id: chunk.id, organization_id: chunk.organizationId, project_id: chunk.projectId,
        repository: chunk.repository, commit_sha: chunk.commit, content_hash: chunk.contentHash,
        exact_identifiers: chunk.exactIdentifiers, sort_at: chunk.indexedAt, content_text: chunk.content,
        embedding: chunk.embedding ?? embeddings[index], document: { ...chunk, embedding: undefined }, updated_at: new Date().toISOString(),
      }));
      const { error } = await this.client.from("tracecase_documents").upsert(rows, { onConflict: "row_key" });
      if (error) throw new Error(`Supabase repository indexing failed: ${error.message}`);
    }
  }
  async findRepositoryChunksExact(scope: TenantScope, ids: string[], commit?: string) { if (!ids.length) return []; let query = this.client.from("tracecase_documents").select("document").eq("entity_type", "repository_chunk").eq("organization_id", scope.organizationId).eq("project_id", scope.projectId).overlaps("exact_identifiers", ids); if (commit) query = query.eq("commit_sha", commit); return this.many<RepositoryChunk>(query.limit(40)); }
  async findRepositoryChunksSemantic(scope: TenantScope, queryText: string, filters: { repository?: string; commit?: string } = {}) {
    const [embedding] = await requestEmbeddings([queryText]);
    const { data, error } = await this.client.rpc("tracecase_match_repository_chunks", { p_organization_id: scope.organizationId, p_project_id: scope.projectId, p_query_text: queryText, p_query_embedding: embedding, p_repository: filters.repository ?? null, p_commit: filters.commit ?? null, p_limit: 5 });
    if (error) throw new Error(`Supabase semantic retrieval failed: ${error.message}`);
    return ((data ?? []) as Array<{ document: RepositoryChunk }>).map((row) => row.document);
  }

  async putArtifact(value: Artifact) { const stored = { ...value, storagePath: `supabase://tracecase-artifacts/${storageKey(value)}` }; await this.write("artifact", stored, value.id, { run_id: value.runId, session_id: value.sessionId, sort_at: value.updatedAt ?? value.createdAt, due_at: value.expiresAt }); }
  async putArtifactContent(value: Artifact, content: Uint8Array) { const path = storageKey(value); const { error } = await this.client.storage.from("tracecase-artifacts").upload(path, content, { contentType: value.mimeType ?? "application/octet-stream", upsert: true }); if (error) throw new Error(`Supabase artifact upload failed: ${error.message}`); await this.putArtifact({ ...value, storagePath: `supabase://tracecase-artifacts/${path}` }); }
  async getArtifact(scope: TenantScope, id: string) { return this.one<Artifact>(this.client.from("tracecase_documents").select("document").eq("row_key", rowKey("artifact", scope.organizationId, scope.projectId, id)).maybeSingle()); }
  async getArtifactContent(scope: TenantScope, id: string) { const artifact = await this.getArtifact(scope, id); if (!artifact) return null; const { data, error } = await this.client.storage.from("tracecase-artifacts").download(storageKey(artifact)); if (error) { if (/not found/i.test(error.message)) return null; throw new Error(`Supabase artifact download failed: ${error.message}`); } return new Uint8Array(await data.arrayBuffer()); }
  async listArtifacts(scope: TenantScope, filters: { runId?: string; kind?: Artifact["kind"] } = {}) { let query = this.client.from("tracecase_documents").select("document").eq("entity_type", "artifact").eq("organization_id", scope.organizationId).eq("project_id", scope.projectId); if (filters.runId) query = query.eq("run_id", filters.runId); const values = await this.many<Artifact>(query.order("sort_at", { ascending: false })); return filters.kind ? values.filter((item) => item.kind === filters.kind) : values; }
  async deleteArtifact(scope: TenantScope, id: string) { const artifact = await this.getArtifact(scope, id); if (artifact) await this.client.storage.from("tracecase-artifacts").remove([storageKey(artifact)]); const { error } = await this.client.from("tracecase_documents").delete().eq("row_key", rowKey("artifact", scope.organizationId, scope.projectId, id)); if (error) throw new Error(`Supabase artifact delete failed: ${error.message}`); }
  async putIntakeDraft(value: IntakeDraft) { await this.write("intake_draft", value, value.sessionId, { session_id: value.sessionId, due_at: value.dueAt, sort_at: value.updatedAt }); }
  async getIntakeDraftBySession(scope: TenantScope, sessionId: string) { return this.one<IntakeDraft>(this.client.from("tracecase_documents").select("document").eq("row_key", rowKey("intake_draft", scope.organizationId, scope.projectId, sessionId)).maybeSingle()); }
  async listDueIntakeDrafts(now: string, limit = 100) { return this.many<IntakeDraft>(this.client.from("tracecase_documents").select("document").eq("entity_type", "intake_draft").lte("due_at", now).order("due_at").limit(limit)); }
  async deleteIntakeDraft(scope: TenantScope, sessionId: string) { const { error } = await this.client.from("tracecase_documents").delete().eq("row_key", rowKey("intake_draft", scope.organizationId, scope.projectId, sessionId)); if (error) throw new Error(`Supabase intake draft delete failed: ${error.message}`); }
  async appendAuditEvent(value: AuditEvent) { await this.write("audit_event", value, value.id, { sort_at: value.timestamp }, true); }
  async dispose() {}
}
