import { getDefaultScope } from "@/lib/tracecase/config";
import { json, problem } from "@/lib/tracecase/http";
import { getRuntime } from "@/lib/tracecase/service";
import { createOpaqueId, redactUnknown, verifyWebhookSignature } from "@/lib/tracecase/security";

export async function POST(request: Request) {
  try {
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!secret) return json({ error: "github_webhook_unconfigured" }, 503);
    const body = await request.text();
    if (!verifyWebhookSignature(body, request.headers.get("x-hub-signature-256"), secret)) return json({ error: "invalid_signature" }, 401);
    const delivery = request.headers.get("x-github-delivery") ?? createOpaqueId("delivery");
    const eventName = request.headers.get("x-github-event") ?? "unknown";
    const payload = redactUnknown(JSON.parse(body) as Record<string, unknown>);
    const { store } = await getRuntime();
    const scope = getDefaultScope();
    const project = await store.getProject(scope);
    if (!project) return json({ error: "project_not_bootstrapped" }, 503);
    if (eventName === "installation" || eventName === "installation_repositories") {
      const installation = payload.installation as { id?: number } | undefined;
      const connections = project.connections.map((connection) => connection.provider === "github" ? { ...connection, enabled: true, status: "configured" as const, externalId: installation?.id ? String(installation.id) : connection.externalId } : connection);
      const repositories = [
        ...((payload.repositories as Array<{ name?: string; owner?: { login?: string }; default_branch?: string }> | undefined) ?? []),
        ...((payload.repositories_added as Array<{ name?: string; owner?: { login?: string }; default_branch?: string }> | undefined) ?? []),
      ].filter((repository) => repository.name && repository.owner?.login);
      const selected = project.repository ?? (repositories.length === 1 && installation?.id ? {
        provider: "github" as const,
        owner: repositories[0].owner!.login!,
        name: repositories[0].name!,
        defaultBranch: repositories[0].default_branch ?? "main",
        installationId: String(installation.id),
      } : undefined);
      const repository = selected && installation?.id ? { ...selected, installationId: String(installation.id) } : selected;
      await store.putProject({ ...project, repository, connections, updatedAt: new Date().toISOString() });
    }
    await store.appendAuditEvent({ id: `audit_github_${delivery}`, organizationId: scope.organizationId, projectId: scope.projectId, actorId: "github-app", action: `github.webhook.${eventName}`, target: delivery, result: "changed", details: { delivery, eventName }, timestamp: new Date().toISOString() });
    return json({ accepted: true, delivery, eventName }, 202);
  } catch (error) {
    return problem(error);
  }
}
