export function uiPreviewEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === "development" && env.TRACECASE_UI_PREVIEW === "true";
}
