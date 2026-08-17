import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { getConfig, getDefaultScope } from "../lib/tracecase/config";
import { SupabaseTracecaseStore } from "../lib/tracecase/supabase";
import { sha256 } from "../lib/tracecase/security";

const config = getConfig();
if (!config.supabaseUrl || !config.supabaseSecretKey) throw new Error("Supabase server credentials are required");
const scope = getDefaultScope();
const store = await SupabaseTracecaseStore.connect();
const suffix = Date.now().toString(36);
const artifactId = `artifact_smoke_${suffix}`;
const leaseKey = `smoke:${suffix}`;
try {
  const project = await store.getProject(scope);
  assert.ok(project, "Bootstrapped project is missing");
  assert.equal(await store.acquireLease(scope, leaseKey, "smoke-worker", new Date(Date.now() + 60_000).toISOString()), true);
  const content = new TextEncoder().encode("tracecase-supabase-smoke");
  await store.putArtifactContent({ id: artifactId, ...scope, kind: "attachment", storagePath: "pending", sha256: sha256(content), bytes: content.length, mimeType: "text/plain", redacted: true, expiresAt: new Date(Date.now() + 60_000).toISOString(), createdAt: new Date().toISOString() }, content);
  assert.equal(new TextDecoder().decode(await store.getArtifactContent(scope, artifactId) ?? new Uint8Array()), "tracecase-supabase-smoke");
  const contentHash = sha256(`semantic repository memory ${suffix}`);
  await store.putRepositoryChunks([{ id: `chunk_smoke_${suffix}`, ...scope, repository: "tracecase/smoke", commit: "smoke", contentType: "code", path: `smoke/${suffix}.ts`, exactIdentifiers: [`smoke/${suffix}.ts`], content: `// semantic repository memory\nexport const semanticRepositoryMemory = "${suffix}";`, contentHash, ignored: false, indexedAt: new Date().toISOString() }]);
  const matches = await store.findRepositoryChunksSemantic(scope, "semantic repository memory", { repository: "tracecase/smoke", commit: "smoke" });
  assert.ok(matches.some((chunk) => chunk.contentHash === contentHash), "Hybrid repository retrieval returned no match");
  console.log(JSON.stringify({ ok: true, project: project.name, postgres: true, storage: true, leases: true, hybridSearch: true }));
} finally {
  await store.deleteArtifact(scope, artifactId).catch(() => undefined);
  await store.releaseLease(scope, leaseKey, "smoke-worker").catch(() => undefined);
  const client = createClient(config.supabaseUrl, config.supabaseSecretKey, { auth: { persistSession: false } });
  await client.from("tracecase_documents").delete().eq("entity_type", "repository_chunk").eq("organization_id", scope.organizationId).eq("project_id", scope.projectId).eq("repository", "tracecase/smoke");
  await client.from("tracecase_leases").delete().eq("organization_id", scope.organizationId).eq("project_id", scope.projectId).eq("lease_key", leaseKey);
  await store.dispose();
}
