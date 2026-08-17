import type { RepositoryChunk, TenantScope } from "./contracts";
import type { TracecaseStore } from "./store";

const identifierPatterns = [
  /\b[A-Z][A-Za-z0-9]+(?:Error|Exception)\b/g,
  /\b[A-Fa-f0-9]{7,40}\b/g,
  /\b(?:GET|POST|PUT|PATCH|DELETE)\s+\/[A-Za-z0-9_./:{}-]+/g,
  /\b(?:[A-Za-z0-9_-]+\/)+[A-Za-z0-9_.-]+\.(?:ts|tsx|js|jsx|py|go|rs|java)\b/g,
  /\b(?:ERR|BUG|ISSUE|SENTRY)-[A-Za-z0-9_-]+\b/g,
];

export function extractExactIdentifiers(...values: Array<string | undefined>): string[] {
  const output = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    for (const pattern of identifierPatterns) {
      for (const match of value.matchAll(pattern)) output.add(match[0]);
    }
  }
  return [...output].slice(0, 40);
}

export type RetrievalResult = {
  route: "exact" | "semantic" | "none";
  chunks: RepositoryChunk[];
  queryPlan: object;
};

export async function retrieveRepositoryContext(input: {
  store: TracecaseStore;
  scope: TenantScope;
  identifiers: string[];
  semanticQuery: string;
  repository?: string;
  commit?: string;
}): Promise<RetrievalResult> {
  if (input.identifiers.length > 0) {
    const chunks = await input.store.findRepositoryChunksExact(input.scope, input.identifiers, input.commit);
    if (chunks.length > 0) return { route: "exact", chunks, queryPlan: { find: { ...input.scope, identifiers: input.identifiers, commit: input.commit } } };
  }

  const filter = {
    organizationId: input.scope.organizationId,
    projectId: input.scope.projectId,
    ...(input.repository ? { repository: input.repository } : {}),
    ...(input.commit ? { commit: input.commit } : {}),
    contentType: ["code", "route", "test", "runbook", "decision"],
  };
  const queryPlan = { engine: "supabase_pgvector_hybrid", query: input.semanticQuery, limit: 5, filter };
  let chunks: RepositoryChunk[];
  try {
    chunks = await input.store.findRepositoryChunksSemantic(input.scope, input.semanticQuery, { repository: input.repository, commit: input.commit });
  } catch (error) {
    console.warn("Tracecase semantic retrieval unavailable; continuing with exact context only.", { name: error instanceof Error ? error.name : "UnknownError" });
    return { route: "none", chunks: [], queryPlan: { ...queryPlan, fallback: "semantic_search_unavailable" } };
  }
  if (chunks.length === 0) return { route: "none", chunks: [], queryPlan };
  return { route: "semantic", chunks, queryPlan };
}

export function buildSemanticDuplicatePipeline(scope: TenantScope, query: string) {
  return { engine: "supabase_pgvector_hybrid", source: "operational_memory", scope, query, limit: 5, contentType: "report" };
}
