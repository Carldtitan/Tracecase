import { getConfig, getDefaultScope } from "../lib/tracecase/config";
import type { Project } from "../lib/tracecase/contracts";
import { SupabaseTracecaseStore } from "../lib/tracecase/supabase";
import { sha256 } from "../lib/tracecase/security";

const config = getConfig();
if (config.persistence !== "supabase" || !config.supabaseUrl || !config.supabaseSecretKey) throw new Error("Set TRACECASE_PERSISTENCE=supabase, NEXT_PUBLIC_SUPABASE_URL, and SUPABASE_SECRET_KEY first.");
const scope = getDefaultScope();
const projectKey = process.env.NEXT_PUBLIC_WIDGET_PROJECT_KEY;
const name = process.env.TRACECASE_PROJECT_NAME;
const slug = process.env.TRACECASE_PROJECT_SLUG;
const targetTestUrl = process.env.TRACECASE_TARGET_TEST_URL;
const allowedOrigins = (process.env.TRACECASE_WIDGET_ALLOWED_ORIGINS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
const repositoryOwner = process.env.TRACECASE_GITHUB_REPOSITORY_OWNER;
const repositoryName = process.env.TRACECASE_GITHUB_REPOSITORY_NAME;
const repositoryInstallationId = process.env.TRACECASE_GITHUB_INSTALLATION_ID;
if (!projectKey || !name || !slug || !targetTestUrl || allowedOrigins.length === 0) throw new Error("Project name, slug, target URL, widget key, and allowed origins are required.");

const now = new Date().toISOString();
const project: Project = {
  id: scope.projectId,
  organizationId: scope.organizationId,
  name,
  slug,
  targetTestUrl,
  repository: repositoryOwner && repositoryName ? { provider: "github", owner: repositoryOwner, name: repositoryName, defaultBranch: process.env.TRACECASE_GITHUB_DEFAULT_BRANCH ?? "main", installationId: repositoryInstallationId } : undefined,
  widget: { publicKeyHash: sha256(projectKey), allowedOrigins, enabled: true },
  policy: { allowBranchPush: true, allowDraftPullRequest: true, allowMerge: process.env.ALLOW_AUTO_MERGE === "true", allowDeploy: process.env.ALLOW_AUTO_DEPLOY === "true", maxRunMinutes: config.maxRunMinutes, maxParallelWorkers: config.maxParallelEnvironments, requireHumanForProductionAccess: true },
  retention: { reportsDays: 180, artifactsDays: 30, auditDays: 365 },
  connections: [
    { provider: "github", enabled: false, status: "unconfigured" },
    { provider: "otel", enabled: false, status: "unconfigured" },
    { provider: "daytona", enabled: Boolean(process.env.DAYTONA_API_KEY), status: process.env.DAYTONA_API_KEY ? "configured" : "unconfigured" },
    { provider: "fireworks", enabled: Boolean(process.env.FIREWORKS_API_KEY), status: process.env.FIREWORKS_API_KEY ? "configured" : "unconfigured" },
  ],
  createdAt: now,
  updatedAt: now,
};

const store = await SupabaseTracecaseStore.connect();
try {
  const existing = await store.getProject(scope);
  const existingOrganization = await store.getOrganization(scope.organizationId);
  await store.putOrganization({ id: scope.organizationId, name: process.env.TRACECASE_ORGANIZATION_NAME ?? name, slug: (process.env.TRACECASE_ORGANIZATION_SLUG ?? slug).toLowerCase(), createdAt: existingOrganization?.createdAt ?? now, updatedAt: now });
  await store.putProject({ ...project, createdAt: existing?.createdAt ?? now });
  if (process.env.TRACECASE_OWNER_EMAIL) {
    const email = process.env.TRACECASE_OWNER_EMAIL.toLowerCase();
    const existingOwner = await store.getUserByEmail(scope.organizationId, email);
    await store.putUser({ id: existingOwner?.id ?? `user_${sha256(email).slice(0, 20)}`, organizationId: scope.organizationId, email, displayName: existingOwner?.displayName ?? email.split("@")[0], rolesByProject: { ...(existingOwner?.rolesByProject ?? {}), [scope.projectId]: "owner" }, createdAt: existingOwner?.createdAt ?? now });
  }
  console.log(`Bootstrapped ${project.name} (${project.id}).`);
} finally {
  await store.dispose();
}
