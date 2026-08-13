const checks = [
  { name: "MongoDB", required: ["MONGODB_URI"] },
  { name: "Fireworks", required: ["FIREWORKS_API_KEY", "FIREWORKS_MODEL"] },
  { name: "Daytona", required: ["DAYTONA_API_KEY", "DAYTONA_API_URL"] },
  { name: "GitHub App", required: ["GITHUB_APP_ID", "GITHUB_APP_SLUG", "GITHUB_APP_PRIVATE_KEY_BASE64", "GITHUB_WEBHOOK_SECRET"] },
] as const;

const result = checks.map((check) => {
  const missing = check.required.filter((name) => !process.env[name]);
  return { provider: check.name, configured: missing.length === 0, missing };
});

console.log(JSON.stringify({
  externalCallMade: false,
  runtimeMode: process.env.TRACECASE_RUNTIME_MODE ?? "live",
  externalCallsAllowed: process.env.ALLOW_EXTERNAL_CALLS === "true",
  checks: result,
  readyForLiveRun: result.every((check) => check.configured) && process.env.TRACECASE_RUNTIME_MODE === "live" && process.env.ALLOW_EXTERNAL_CALLS === "true",
}, null, 2));
