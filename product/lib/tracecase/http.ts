import { ZodError } from "zod";
import { redactText } from "./security";

export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(data, { status, headers: { "cache-control": "no-store", ...headers } });
}

export function problem(error: unknown): Response {
  if (error instanceof ZodError) return json({ error: "invalid_request", issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) }, 400);
  const message = error instanceof Error ? error.message : "Unknown error";
  if (message.includes("Rate limit")) return json({ error: "rate_limited" }, 429);
  if (message.includes("Authentication required")) return json({ error: "unauthorized" }, 401);
  if (message.includes("access denied")) return json({ error: "forbidden" }, 403);
  if (message.includes("Unknown or disabled")) return json({ error: "project_not_found" }, 404);
  if (message.includes("Widget session") || message.includes("session does not match")) return json({ error: "invalid_widget_session" }, 401);
  console.error("Tracecase request failed", { name: error instanceof Error ? error.name : "UnknownError", message: redactText(message) });
  return json({ error: "request_failed" }, 500);
}
