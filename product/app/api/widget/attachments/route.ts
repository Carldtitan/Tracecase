import sharp from "sharp";
import { json, problem } from "@/lib/tracecase/http";
import { getRuntime, resolveWidgetSession } from "@/lib/tracecase/service";
import { createOpaqueId, redactText, sha256 } from "@/lib/tracecase/security";

const MAX_BYTES = 4 * 1024 * 1024;
const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp", "text/plain", "application/json"]);

function safeName(value: string): string {
  return value.replace(/[^A-Za-z0-9_. -]/g, "_").slice(0, 120) || "attachment";
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const projectKey = form.get("projectKey");
    const sessionToken = form.get("sessionToken");
    const file = form.get("file");
    if (typeof projectKey !== "string" || typeof sessionToken !== "string" || !(file instanceof File)) return json({ error: "project_session_and_file_required" }, 400);
    if (!allowedTypes.has(file.type)) return json({ error: "unsupported_attachment_type" }, 415);
    if (file.size < 1 || file.size > MAX_BYTES) return json({ error: "attachment_too_large", maxBytes: MAX_BYTES }, 413);
    const { project, sessionId } = await resolveWidgetSession(projectKey, sessionToken);
    const scope = { organizationId: project.organizationId, projectId: project.id };
    let content = Buffer.from(await file.arrayBuffer());
    let mimeType = file.type;
    let redacted = false;
    if (file.type.startsWith("image/")) {
      content = await sharp(content, { limitInputPixels: 25_000_000 }).rotate().jpeg({ quality: 88, mozjpeg: true }).toBuffer();
      mimeType = "image/jpeg";
    } else {
      content = Buffer.from(redactText(content.toString("utf8")).slice(0, 500_000), "utf8");
      mimeType = "text/plain; charset=utf-8";
      redacted = true;
    }
    const now = new Date();
    const artifact = {
      id: createOpaqueId("attachment"),
      ...scope,
      sessionId,
      kind: "attachment" as const,
      storagePath: "mongodb://artifact_blobs",
      sha256: sha256(content),
      bytes: content.byteLength,
      mimeType,
      originalName: safeName(file.name),
      redacted,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + project.retention.artifactsDays * 86_400_000).toISOString(),
    };
    const { store } = await getRuntime();
    await store.putArtifactContent(artifact, content);
    return json({ attachmentId: artifact.id, name: artifact.originalName, mimeType, bytes: artifact.bytes, redacted }, 201);
  } catch (error) {
    return problem(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json() as { projectKey?: string; sessionToken?: string; attachmentId?: string };
    if (!body.projectKey || !body.sessionToken || !body.attachmentId) return json({ error: "project_session_and_attachment_required" }, 400);
    const { project, sessionId } = await resolveWidgetSession(body.projectKey, body.sessionToken);
    const scope = { organizationId: project.organizationId, projectId: project.id };
    const { store } = await getRuntime();
    const artifact = await store.getArtifact(scope, body.attachmentId);
    if (!artifact || artifact.kind !== "attachment" || artifact.sessionId !== sessionId || artifact.runId) return json({ error: "attachment_not_found" }, 404);
    await store.deleteArtifact(scope, body.attachmentId);
    return json({ deleted: true });
  } catch (error) {
    return problem(error);
  }
}
