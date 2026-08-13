import type { CaseDocument } from "./contracts";

export function buildDraftPullRequestBody(input: { caseDocument: CaseDocument; run: { id: string; outcome?: { summary: string; testedScope: string[]; uncertainty: string[] }; patch?: { regression: { path: string; baseFailed: boolean; patchPassed: boolean }; files: Array<{ path: string }> } }; evidenceBundleId: string }): string {
  const scope = input.run.outcome?.testedScope.map((item) => `- ${item}`).join("\n") || "- No environment result recorded";
  const uncertainty = input.run.outcome?.uncertainty.map((item) => `- ${item}`).join("\n") || "- None recorded";
  const files = input.run.patch?.files.map((file) => `- \`${file.path}\``).join("\n") || "- No patch files";
  return `## Tracecase evidence\n\nCase: ${input.caseDocument.id}\nRun: ${input.run.id}\nEvidence bundle: ${input.evidenceBundleId}\n\n### Reproduction\n\n${input.run.outcome?.summary ?? "No reproduction summary"}\n\n### Tested scope\n\n${scope}\n\n### Regression proof\n\n- Test: \`${input.run.patch?.regression.path ?? "not generated"}\`\n- Baseline failed: ${input.run.patch?.regression.baseFailed ?? false}\n- Patch passed: ${input.run.patch?.regression.patchPassed ?? false}\n\n### Changed files\n\n${files}\n\n### Remaining uncertainty\n\n${uncertainty}\n`;
}
