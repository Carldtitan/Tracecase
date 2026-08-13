import { getConfig, getDefaultScope } from "../lib/tracecase/config";
import type { Project } from "../lib/tracecase/contracts";
import { MongoTracecaseStore } from "../lib/tracecase/mongodb";
import { sha256 } from "../lib/tracecase/security";

const config = getConfig();
if (config.persistence !== "mongodb" || !config.mongodbUri) throw new Error("Set TRACECASE_PERSISTENCE=mongodb and MONGODB_URI first.");
const scope = getDefaultScope();
const projectKey = process.env.NEXT_PUBLIC_WIDGET_PROJECT_KEY;
const name = process.env.TRACECASE_PROJECT_NAME;
const slug = process.env.TRACECASE_PROJECT_SLUG;
const targetTestUrl = process.env.TRACECASE_TARGET_TEST_URL;
const allowedOrigins = (process.env.TRACECASE_WIDGET_ALLOWED_ORIGINS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
if (!projectKey || !name || !slug || !targetTestUrl || allowedOrigins.length === 0) throw new Error("Project name, slug, target URL, widget key, and allowed origins are required.");

const now = new Date().toISOString();
const project: Project = {
  id: scope.projectId,
  organizationId: scope.organizationId,
  name,
  slug,
  targetTestUrl,
  widget: { publicKeyHash: sha256(projectKey), allowedOrigins, enabled: true },
  policy: { allowBranchPush: true, allowDraftPullRequest: true, allowMerge: false, allowDeploy: false, maxRunMinutes: config.maxRunMinutes, maxParallelWorkers: config.maxParallelEnvironments, requireHumanForProductionAccess: true },
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

const store = await MongoTracecaseStore.connect();
try {
  const existing = await store.getProject(scope);
  await store.putProject({ ...project, createdAt: existing?.createdAt ?? now });
  console.log(`Bootstrapped ${project.name} (${project.id}).`);
} finally {
  await store.dispose();
}
