import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Project, User } from "./contracts";

const secretPatterns = [
  /\b(?:authorization|cookie|set-cookie)\s*[:=]\s*[^\s,;]+/gi,
  /\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*["']?[^\s,"';]+/gi,
  /\b(?:ghp|github_pat|sk|AKIA)[_-]?[A-Za-z0-9_-]{12,}\b/g,
  /mongodb(?:\+srv)?:\/\/[^\s]+/gi,
];

export function redactText(value: string): string {
  return secretPatterns.reduce((safe, pattern) => safe.replace(pattern, "[REDACTED]"), value);
}

export function redactUnknown<T>(value: T): T {
  if (typeof value === "string") return redactText(value) as T;
  if (Array.isArray(value)) return value.map(redactUnknown) as T;
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      output[key] = /cookie|authorization|password|secret|token/i.test(key) ? "[REDACTED]" : redactUnknown(child);
    }
    return output as T;
  }
  return value;
}

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function createOpaqueId(prefix: string): string {
  return `${prefix}_${randomBytes(10).toString("hex")}`;
}

function encode(value: string): string {
  return Buffer.from(value).toString("base64url");
}

export function signToken(payload: Record<string, unknown>, secret: string, ttlSeconds: number): string {
  const body = encode(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyToken<T extends Record<string, unknown>>(token: string, secret: string): T {
  const [body, signature] = token.split(".");
  if (!body || !signature) throw new Error("Malformed signed token");
  const expected = createHmac("sha256", secret).update(body).digest();
  const received = Buffer.from(signature, "base64url");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new Error("Invalid signed token");
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T & { exp?: number };
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) throw new Error("Expired signed token");
  return payload;
}

export function signManifest(payload: object, secret: string): string {
  return createHmac("sha256", secret).update(stableJson(payload)).digest("hex");
}

export function verifyWebhookSignature(body: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(body).digest("hex")}`);
  const received = Buffer.from(signatureHeader);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function verifyManifest(payload: object, signature: string, secret: string): boolean {
  const expected = Buffer.from(signManifest(payload, secret));
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const roleRank = { viewer: 1, support: 1, engineer: 2, admin: 3, owner: 4 } as const;

export function authorizeProject(user: User, project: Project, minimumRole: keyof typeof roleRank): void {
  const role = user.rolesByProject[project.id];
  if (user.organizationId !== project.organizationId || !role || roleRank[role] < roleRank[minimumRole]) {
    throw new Error("Project access denied");
  }
}

export function isPromptInjection(value: string): boolean {
  return /(ignore (all|any|the) (previous|prior)|system prompt|developer message|reveal .*secret|exfiltrat|override .*instruction)/i.test(value);
}

export function filterRepositoryContent(path: string, content: string): { ignored: boolean; safeContent: string; reason?: string } {
  if (/(^|\/)(\.env|\.git|node_modules|dist|build|coverage)(\/|$)/i.test(path) || /\.(pem|key|p12|pfx)$/i.test(path)) {
    return { ignored: true, safeContent: "", reason: "sensitive or generated path" };
  }
  if (isPromptInjection(content)) {
    return { ignored: false, safeContent: redactText(content), reason: "untrusted instructions retained as data only" };
  }
  return { ignored: false, safeContent: redactText(content) };
}
