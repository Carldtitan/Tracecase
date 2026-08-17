const checks = [
  { name: "Supabase", required: ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY"] },
  { name: "Fireworks", required: ["FIREWORKS_API_KEY", "FIREWORKS_MODEL"] },
  { name: "Daytona", required: ["DAYTONA_API_KEY", "DAYTONA_API_URL"] },
  { name: "GitHub sign-in", required: ["AUTH_GITHUB_ID", "AUTH_GITHUB_SECRET", "AUTH_SECRET"] },
  { name: "GitHub App", required: ["GITHUB_APP_ID", "GITHUB_APP_SLUG", "GITHUB_APP_PRIVATE_KEY_BASE64", "GITHUB_WEBHOOK_SECRET"] },
  { name: "Execution", required: ["NEXT_PUBLIC_APP_URL", "WORKER_SIGNING_SECRET", "TRACECASE_ORGANIZATION_ID", "TRACECASE_PROJECT_ID", "TRACECASE_TARGET_TEST_URL"] },
  { name: "BrowserStack real platforms", required: ["BROWSERSTACK_USERNAME", "BROWSERSTACK_ACCESS_KEY"] },
  { name: "Delayed intake", required: ["CRON_SECRET"] },
  { name: "MCP", required: ["MCP_API_KEY"] },
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
  readyForLiveRun: result.slice(0, 6).every((check) => check.configured) && process.env.TRACECASE_RUNTIME_MODE === "live" && process.env.ALLOW_EXTERNAL_CALLS === "true",
  readyForGenuinePlatforms: result.find((check) => check.provider === "BrowserStack real platforms")?.configured === true && process.env.REAL_DEVICE_PROVIDER === "browserstack",
}, null, 2));
