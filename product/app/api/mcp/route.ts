import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { getDefaultScope } from "@/lib/tracecase/config";
import { dispatchRun } from "@/lib/tracecase/execution";
import { getRuntime } from "@/lib/tracecase/service";

export const maxDuration = 300;

const handler = createMcpHandler(async () => {
  const server = new McpServer({ name: "tracecase", version: "1.0.0" });
  server.registerTool("list_cases", {
    title: "List Tracecase cases",
    description: "List recent bug cases in the configured Tracecase project.",
    inputSchema: z.object({ limit: z.number().int().min(1).max(50).default(20) }),
  }, async ({ limit }) => {
    const { store } = await getRuntime();
    const cases = await store.listCases(getDefaultScope(), limit);
    return { content: [{ type: "text", text: JSON.stringify(cases) }], structuredContent: { cases } };
  });
  server.registerTool("get_run", {
    title: "Get investigation run",
    description: "Read one Tracecase run, its evidence timeline, and artifact metadata.",
    inputSchema: z.object({ runId: z.string().min(3).max(96) }),
  }, async ({ runId }) => {
    const { store } = await getRuntime();
    const scope = getDefaultScope();
    const [run, events, artifacts] = await Promise.all([store.getRun(scope, runId), store.listRunEvents(scope, runId), store.listArtifacts(scope, { runId })]);
    if (!run) return { isError: true, content: [{ type: "text", text: "Run not found." }] };
    const result = { run, events, artifacts };
    return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
  });
  server.registerTool("start_run", {
    title: "Start investigation",
    description: "Dispatch a queued or failed Tracecase investigation to its isolated workers.",
    inputSchema: z.object({ runId: z.string().min(3).max(96) }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async ({ runId }) => {
    const result = await dispatchRun(getDefaultScope(), runId);
    return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
  });
  return server;
}, { responseMode: "json" });

async function serve(request: Request): Promise<Response> {
  const expected = process.env.MCP_API_KEY;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) return Response.json({ error: "unauthorized" }, { status: 401, headers: { "www-authenticate": "Bearer" } });
  const configuredHost = process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL).host : request.headers.get("host");
  if (configuredHost && request.headers.get("host") !== configuredHost) return Response.json({ error: "invalid_host" }, { status: 421 });
  return handler.fetch(request);
}

export const POST = serve;
export const GET = serve;
export const DELETE = serve;
