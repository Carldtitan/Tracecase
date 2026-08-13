# Implementation Record: Tracecase

## Status

The local product and all provider-facing code paths are implemented. The default runtime is fixture mode with in-memory persistence and all external calls disabled. Credential-dependent activation is listed separately at the end of this file. Those checks must not be marked complete until the real provider confirms them.

## Verification discipline

- A provider is not “connected” because an adapter or fixture exists.
- A reproduction needs a failed observable assertion.
- A fix needs baseline-fail, patch-pass, and a comparable environment.
- Unknown reporter state stays Unknown.
- Branch push and draft pull request creation follow Project policy.
- V1 has no merge or deploy capability.

## Completed local implementation

- [x] 1. Establish the product contract
  - [x] 1.1 Write `PRODUCT.md` with users, purpose, personality, anti-references, principles, and accessibility.
  - [x] 1.2 Write `DESIGN.md` using the local Impeccable product guidance and OKLCH tokens.
  - [x] 1.3 Create root and app-local `.env.example` files with required, conditional, and optional connections.
  - _Requirements: 19, 20_

- [x] 2. Implement the V1 interface shell
  - [x] 2.1 Build the embedded reporter route with notice, question, consent, review, error, and submitted states.
  - [x] 2.2 Build the organization and Project shell with the Worker wall.
  - [x] 2.3 Build the separate evidence and code-diff route.
  - [x] 2.4 Verify keyboard, reduced-motion, responsive, and empty/error behavior.
  - _Requirements: 1, 3, 4, 5, 14, 15, 19_

- [x] 3. Add tenant and Project persistence
  - [x] 3.1 Define Zod domain schemas, MongoDB JSON Schema validators, bounded embedded data, and compound tenant indexes.
  - [x] 3.2 Add Project role checks for `owner`, `admin`, `engineer`, `support`, and `viewer`.
  - [x] 3.3 Add connection state, policy, retention, target URL, and rotatable widget-key management.
  - [x] 3.4 Add append-only audit records for access, policy, webhook, merge, and key changes.
  - _Requirements: 1, 2, 16, 18_

- [x] 4. Build the embeddable intake system
  - [x] 4.1 Package an isolated Shadow DOM web component and keep `/intake` as the hosted fallback.
  - [x] 4.2 Implement signed anonymous sessions, local draft recovery, rate limiting, and project-key binding.
  - [x] 4.3 Implement bounded deterministic follow-up questions and conflict clarification.
  - [x] 4.4 Implement separate consent, text redaction, masked screenshot upload, size/type limits, retention, and deletion.
  - [x] 4.5 Implement timeout finalization that submits unanswered fields as explicit Unknowns.
  - _Requirements: 3, 4, 5_

- [x] 5. Implement canonical Case intake
  - [x] 5.1 Store immutable Reports and derived canonical Cases.
  - [x] 5.2 Correlate exact errors, releases, routes, commits, and paths before semantic search.
  - [x] 5.3 Define tenant-filtered semantic duplicate pipelines and exact/semantic retrieval fixtures.
  - [x] 5.4 Add a human merge gate with preserved Report provenance.
  - _Requirements: 6, 16_

- [x] 6. Implement GitHub connection and indexing code
  - [x] 6.1 Add GitHub App install URL and signed webhook handlers without making a live call.
  - [x] 6.2 Add a local repository scanner for manifests, routes, tests, ownership, releases, runbooks, decisions, and code.
  - [x] 6.3 Add content-hash incremental chunks with repository, commit, type, path, and source metadata.
  - [x] 6.4 Route exact paths, symbols, commits, releases, issues, and errors before Vector Search.
  - [x] 6.5 Exclude ignored/generated/secret paths and treat repository instructions as untrusted data.
  - _Requirements: 2, 7, 16, 18_

- [x] 7. Define MongoDB semantic retrieval
  - [x] 7.1 Define the code Vector Search index with tenant, Project, repository, commit, and content-type filters.
  - [x] 7.2 Define the report, runbook, Case, and decision operational-memory index.
  - [x] 7.3 Build filtered Atlas `$vectorSearch` pipelines and preserve exact-query routing.
  - [x] 7.4 Add exact and semantic routing evaluation fixtures.
  - _Requirements: 7, 16_

- [x] 8. Add telemetry adapters
  - [x] 8.1 Add run/Worker correlation headers and Playwright console, response, failure, screenshot, video, and timing capture.
  - [x] 8.2 Add local OTLP ingestion with recursive redaction and durable run events.
  - [x] 8.3 Add Sentry and Jira adapters behind fail-closed connection flags.
  - [x] 8.4 Prove the complete fixture investigation works without Sentry or Jira.
  - _Requirements: 2, 8, 20_

- [x] 9. Build the investigation planner
  - [x] 9.1 Implement deterministic A/B/C classification with stored reasons.
  - [x] 9.2 Implement bounded Hypothesis and Environment contracts.
  - [x] 9.3 Implement diverse Class-C seeding and adaptive next-batch selection.
  - [x] 9.4 Add cancellation rules for time, Worker count, resolved hypotheses, and low information gain.
  - _Requirements: 9, 10_

- [x] 10. Implement isolated browser Worker code
  - [x] 10.1 Add a fail-closed Daytona adapter and a pinned ephemeral Worker shell entry point.
  - [x] 10.2 Implement signed, expiring Worker manifests and a browser network allowlist.
  - [x] 10.3 Implement Playwright actions, assertions, screenshots, video, console, network, and time limits.
  - [x] 10.4 Stream typed events over SSE and rebuild streams from persisted run events.
  - [x] 10.5 Add an optional GitHub Actions macOS WebKit and iOS-harness workflow. The core path does not depend on it.
  - _Requirements: 10, 11, 14, 16, 18, 20_

- [x] 11. Prove reproduction
  - [x] 11.1 Define deterministic DOM, network, console, visual, and application-state assertion contracts.
  - [x] 11.2 Save a redacted Evidence Bundle with Worker results, environment definitions, assertions, tested scope, and uncertainty.
  - [x] 11.3 Implement `not reproduced within tested scope` without claiming the bug does not exist.
  - [x] 11.4 Add a state-specific and environment-specific reduced-motion fixture bug.
  - _Requirements: 11_

- [x] 12. Generate and verify a fix
  - [x] 12.1 Retrieve fix context with repository, commit, path, and hash provenance.
  - [x] 12.2 Generate a regression test proof and record baseline failure.
  - [x] 12.3 Apply the smallest fixture patch and record exact-reproduction plus relevant-test results.
  - [x] 12.4 Keep pre-existing failures separate from patch regressions.
  - [x] 12.5 Stop at diagnosis-only when the complete proof gate does not pass.
  - _Requirements: 12_

- [x] 13. Prepare the GitHub review handoff
  - [x] 13.1 Add policy gates for branch push and draft pull-request creation.
  - [x] 13.2 Add idempotent branch, file-commit, and draft pull-request methods.
  - [x] 13.3 Build the review body from Case, run, evidence bundle, tested scope, regression proof, files, and uncertainty.
  - [x] 13.4 Make merge and deploy methods impossible in V1.
  - _Requirements: 13, 15, 17, 18_

- [x] 14. Make LangGraph orchestration durable
  - [x] 14.1 Add per-node leases, durable application checkpoints, idempotency keys, and bounded backoff.
  - [x] 14.2 Resume a graph node from its last complete stored update after interruption.
  - [x] 14.3 Prove replay does not duplicate model work or run events.
  - [x] 14.4 Use distinct supervisor, planner, browser, reproduction, fix, and review nodes with conditional edges.
  - _Requirements: 16, 17_

- [x] 15. Validate security and privacy locally
  - [x] 15.1 Test tenant isolation and role enforcement.
  - [x] 15.2 Test malicious repository and intake prompt-injection detection.
  - [x] 15.3 Test cookie, authorization-header, token, connection-string, source-secret, and screenshot masking.
  - [x] 15.4 Add audited, human-approved, one-hour-maximum production-access grants.
  - _Requirements: 5, 18_

- [x] 16. Validate the local product end to end
  - [x] 16.1 Submit a vague report through the built widget API with a signed anonymous session.
  - [x] 16.2 Complete a Class-C run across eight deterministic Worker contracts.
  - [x] 16.3 Prove reproduction, baseline-failing regression, patched pass, and a review-only handoff.
  - [x] 16.4 Complete the bounded fixture path in about 100 ms, well below two minutes.
  - [x] 16.5 Pass TypeScript, ESLint, unit, replay, redaction, build, rendered HTML, and local HTTP checks.
  - _Requirements: 3–20_

## Provider activation gates for tomorrow

These items need credentials or provider-side resources. The code is present, but these checks are intentionally not marked complete.

- [ ] A1. Create the Atlas Project and cluster, then set `TRACECASE_PERSISTENCE=mongodb` and `MONGODB_URI`.
- [ ] A2. Run `npm run mongo:plan`, inspect the output, then run `MONGODB_APPLY_CHANGES=true npm run mongo:apply` against the intended database.
- [ ] A3. Create the two Atlas Vector Search or Automated Embedding indexes from `atlasSearchIndexPlans`; confirm their dimensions match the selected embedding model.
- [ ] A4. Configure the Fireworks key and selected vision/tool-use model, then replace fixture reasoning with the live structured-output adapter.
- [ ] A5. Configure Daytona, upload a signed Worker manifest, run `scripts/worker-entry.sh`, and confirm browser artifacts return to the control plane.
- [ ] A6. Create and install the GitHub App, set its App and webhook credentials, verify the webhook, and test one dedicated branch plus one draft pull request in a disposable repository.
- [ ] A7. Set the real repository, commit, target test URL, fixture authorization, and allowed hosts for the demo Project.
- [ ] A8. Send real OpenTelemetry data if the target application has it. Keep Sentry and Jira disabled unless they add useful context.
- [ ] A9. Run one provider-backed Class-C investigation. Confirm eight stable tiles, a failed observable assertion, a redacted Evidence Bundle, base-fail, patch-pass, and a draft pull request.
- [ ] A10. Run secret scanning and inspect provider-granted scopes before the stage demo.

## Commands

From `product/`:

```bash
npm run typecheck
npm run lint
npm test
npm run demo:local
npm run mongo:plan
npm run repo:index-local -- .
```

The MongoDB apply command refuses to run unless `MONGODB_APPLY_CHANGES=true`. All live adapters refuse to run unless `TRACECASE_RUNTIME_MODE=live` and `ALLOW_EXTERNAL_CALLS=true`.
