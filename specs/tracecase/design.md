# Design Document

## Overview

Tracecase is a multi-tenant control plane for report intake, context retrieval, isolated browser investigation, evidence management, and reviewed code change. The architecture separates orchestration from execution: the control plane owns policy and durable state; ephemeral Workers receive a narrow task and return artifacts.

### Design principles

1. Persist every important decision and external side effect before moving forward.
2. Use deterministic queries for known identifiers and semantic search only for fuzzy context.
3. Keep observations, inferences, and unknowns separate in storage and UI.
4. Narrow the environment search after every useful observation.
5. Treat production access, branch push, and pull-request creation as policy-controlled gates.

## Technology stack

| Layer | Choice | Purpose | Core cost posture |
| --- | --- | --- | --- |
| Web product | React 19 + Vinext/Next-compatible App Router + TypeScript | Widget, dashboard, review UI, API surface | Local/open source; deployable to a free web tier |
| Operational memory | MongoDB Atlas | Tenant records, run checkpoints, exact search, Atlas Vector Search | Hackathon Pro allocation |
| Embeddings | Atlas Automated Embedding with Voyage models | Code and incident-context retrieval | Included in the supplied Atlas configuration/credits; verify project limits |
| Agent inference | Fireworks API, configured model | Planning, vision, tool selection, diagnosis, patch reasoning | User-provided credit |
| Isolated execution | Daytona | Ephemeral repository workspaces and browser Workers | User-provided credit |
| Browser automation | Playwright | Page actions, capture, assertions, browser profiles | Open source |
| Repository | GitHub App/API | Installation-scoped code, checks, branches, draft PRs | Free API; Actions usage depends on repository allowance |
| Telemetry | OpenTelemetry | Vendor-neutral logs and trace correlation | Open source |
| Optional incident source | Sentry API | Existing errors, releases, traces, replay metadata | Optional; customer plan applies |
| Optional work tracker | Jira API | Ticket import and status synchronization | Optional; customer plan applies |

## High-level architecture

### Production execution topology

Vercel is the short-lived authenticated control plane. It writes the queued Run to MongoDB and provisions one Daytona coordinator, then returns. The coordinator holds the short-lived provider credentials needed to plan and provision work, but it never installs dependencies or executes code from the connected repository.

Each planned browser environment runs in its own Daytona sandbox. Browser sandboxes receive a signed task, public test URL, network allowlist, and privacy selectors; they receive no GitHub, MongoDB, Fireworks, or Daytona credential. A separate verifier sandbox receives the pinned repository and proposed file content. It may install dependencies and run allowlisted test/start commands, but it also receives no provider credential.

The coordinator sends HMAC-signed progress and completion callbacks to the control plane. A production LangGraph completion graph stores artifacts and repository context, applies the deterministic proof gate, and uses the GitHub App to create an atomic commit and draft pull request. The callback is idempotent: artifacts and events use deterministic identifiers, MongoDB writes are upserts, and the GitHub adapter returns the existing Tracecase pull request instead of duplicating it.

```text
Host website + widget        Engineer dashboard
          |                         |
          +---------- API ----------+
                         |
               Tracecase control plane
       +-----------------+------------------+
       |                 |                  |
  Intake agent      Run orchestrator   Review/PR service
       |                 |                  |
       +------------- MongoDB Atlas --------+
       |      exact records + vector context|
       |                 |                  |
  GitHub context    Daytona workers    GitHub App
  OTEL / Sentry     Playwright         draft PR
```

The browser dashboard subscribes to a run event stream. The source of truth remains MongoDB; streamed events are projections and may be rebuilt.

## Connections and why they exist

### MongoDB Atlas

MongoDB stores the complete operational graph: reports, cases, evidence, plans, Workers, tool calls, checkpoints, code proposals, and audit events. Compound indexes handle known tenant, project, case, run, path, commit, release, and signature lookups. Automated embeddings feed two vector indexes: code-oriented chunks use `voyage-code-3`; report, runbook, and decision chunks use `voyage-4`.

### GitHub

A GitHub App provides installation-scoped repository access, webhook delivery, commit and release context, checks, branch creation, and draft pull requests. App installation tokens are short lived. Repository webhooks drive incremental indexing.

### Fireworks

The configured vision-capable model consumes a bounded evidence package and returns typed plans, classifications, questions, hypotheses, or patches. It never receives provider credentials, cookies, raw authorization headers, or unrelated repository files.

### Daytona and Playwright

Daytona supplies disposable Linux workspaces pinned to an image and repository commit. Playwright runs within each workspace. Most “environment” variations are browser and application profiles—viewport, user agent, locale, timezone, color scheme, network, flags, fixtures—not false claims of running Windows or macOS. Apple-specific jobs are a separate GitHub Actions workflow when enabled.

### OpenTelemetry and optional Sentry

Every Worker adds `tracecase.run_id`, `tracecase.worker_id`, and `tracecase.case_id` to supported requests. The product can ingest corresponding OTLP signals. Sentry is an adapter for customers that already have Sentry evidence; it is not the core observability dependency.

### Jira

Jira is an optional bidirectional intake/status adapter. Tracecase keeps its canonical Case while preserving the Jira issue key and update cursor. The embedded widget remains the direct reporter interface.

## Module layout

```text
product/
  app/
    intake/                       embedded intake demonstration
    app/runs/                     live environment wall
    app/runs/[runId]/diff/        separate evidence and code review
    api/widget/                   widget session/report routes
    api/runs/                     run creation and event projection
    api/integrations/             GitHub, telemetry, and tracker callbacks
  components/
    intake/                       reporter conversation and consent
    runs/                         worker wall, timeline, evidence rail
    review/                       test evidence and diff viewer
  lib/
    domain/                       schemas and state machines
    agents/                       typed Fireworks requests and policies
    mongodb/                      collections, exact queries, vector retrieval
    github/                       App adapter and repository indexing
    execution/                    Daytona and Playwright adapters
    telemetry/                    OTLP correlation and redaction
    security/                     tenant scope, secrets, policy gates
```

## Canonical data model

Every tenant-scoped document includes `organizationId` and `projectId`. Every mutable record includes `createdAt`, `updatedAt`, and `version`.

### Core collections

- `organizations`: name, slug, plan, retention policy.
- `memberships`: organization, user, role, status.
- `projects`: repository installation, target environments, widget settings, policies.
- `reports`: immutable original message, answers, consent, client signals, attachments.
- `cases`: canonical summary, severity, status, known facts, unknowns, linked reports.
- `runs`: class, goal, plan version, budget, current phase, outcome.
- `workers`: environment definition, hypothesis, lease, action, status, attempt.
- `observations`: typed fact, source, artifact references, correlation identifiers.
- `hypotheses`: statement, supporting and contradicting evidence, rank, disposition.
- `agent_actions`: action type, prompt version, model, referenced inputs, tool result, idempotency key.
- `artifacts`: kind, redacted storage reference, hash, MIME type, retention.
- `repo_chunks`: repository, commit, path, symbol, line range, text, embedding metadata.
- `decisions`: gate, proposed action, evidence, actor, approval and expiry.
- `patches`: base commit, branch, files, test commands, results, PR metadata.
- `audit_events`: append-only actor, event, resource, timestamp, request correlation.

### Required indexes

- Unique `(organizationId, slug)` and `(organizationId, projectId, widgetKeyHash)`.
- Unique `(projectId, provider, externalId)` for reports and integration events.
- `(projectId, status, updatedAt)` for Case and Run queues.
- Unique `(runId, workerId)` and `(runId, idempotencyKey)`.
- `(repositoryId, commit, path, symbol)` for exact code retrieval.
- Vector indexes filtered by `organizationId`, `projectId`, `repositoryId`, and `contentType`.
- TTL indexes only for ephemeral sessions and expired leases; canonical evidence uses explicit retention jobs.

## Intake state machine

```text
opened -> notice -> describing -> clarifying -> review -> submitted
                      |             |             |
                      +-- paused ---+-------------+
                                      timeout -> submitted_with_unknowns
```

The Intake Agent receives the confirmed facts, unknown fields, permitted evidence types, and a strict question schema. It selects one question whose answer has the highest expected effect on the investigation plan. A deterministic validator rejects compound, leading, duplicate, or sensitive questions.

## Context classification

### Class A

Requires exact release plus incident-specific execution evidence such as replay, trace, or authenticated fixture. Start one exact reconstruction and a small control environment.

### Class B

Has at least one incident-specific technical signal but misses a material state. Start from known dimensions and test only the unknown dimensions that can explain the symptom.

### Class C

Has the report but no incident-specific runtime state. Derive hypotheses from route, repository, recent changes, tests, known failure modes, and safe app exploration. Seed a diverse first batch, then use observations to select the next batch. Never multiply every dimension into a full matrix.

The class is derived by rules, not model preference, and can narrow as evidence arrives.

## Investigation workflow

1. Normalize the report without rewriting the original.
2. Resolve exact repository, route, release, error, and ownership references.
3. Retrieve semantically relevant code, runbooks, prior Cases, and decisions.
4. Assign Context Class and generate a bounded hypothesis plan.
5. Create isolated Workers with signed, expiring task manifests.
6. Stream action and artifact metadata while persisting checkpoints.
7. Require a failing observable assertion before marking reproduction.
8. Freeze the reproduction fixture and retrieve fix-specific context.
9. Add a regression test, prove it fails on the base commit, then apply the smallest patch.
10. Rerun the exact environment and relevant test suite.
11. Present evidence and diff; create a draft pull request only when policy allows.

## Worker contract

A Worker receives:

- Pinned repository and commit.
- Target URL or local start command.
- One environment definition and one hypothesis.
- Scoped fixture identifiers, never unrestricted production credentials.
- Allowed tool list, maximum duration, network allowlist, and artifact policy.
- Run, Case, and Worker correlation identifiers.

A Worker returns typed events: `ready`, `action.started`, `action.finished`, `observation`, `artifact.created`, `assertion.failed`, `assertion.passed`, `blocked`, and `completed`.

## UI information architecture

- `/intake`: realistic host page plus the embeddable reporter drawer.
- `/app/runs`: organization shell, current Run summary, live Worker wall, investigation timeline, and selected-worker evidence.
- `/app/runs/:runId/diff`: root cause, proof, regression result, changed files, unified diff, checks, and draft-PR state.
- Future routes: Cases, Projects, Connections, Team, Audit, and Organization settings.

## Security boundaries

- The widget key identifies a Project but grants no read access.
- Secrets live in an encrypted provider, not MongoDB searchable content.
- App installation tokens and Worker credentials are created just in time and expire.
- Workers use a network allowlist and cannot reach the control-plane database directly.
- All uploaded and generated artifacts pass through MIME validation, size limits, malware scanning hook, secret redaction, and content hashing.
- Model output is untrusted input. Typed schemas, allowlisted tools, policy checks, and evidence requirements constrain every action.

## Error handling

- Provider outage: checkpoint, retry within budget, then show a named dependency failure.
- Browser crash: preserve partial artifacts and retry once in a fresh Worker.
- Repository build failure: distinguish base-commit failure from agent-introduced failure.
- Telemetry absence: continue with browser evidence and mark the gap.
- Invalid model output: reject, retry with schema feedback, then fall back to deterministic handling or human review.
- Stream disconnect: rebuild the dashboard from persisted Worker state and event sequence.
- Duplicate webhook or action: deduplicate by provider event ID or idempotency key.

## Correctness properties

1. A Run can never be `reproduced` without at least one failing observable assertion and its evidence.
2. A Patch can never be `verified` unless its regression test failed on the base and passed on the patch.
3. Unknown facts cannot be promoted to Observed Facts without an evidence source.
4. Exact identifiers never depend on vector similarity.
5. Vector search is always filtered to the current tenant and authorized Project.
6. Replaying any checkpointed action does not duplicate an external side effect.
7. A Worker cannot receive a secret outside its declared task scope.
8. A draft pull request always points to the same base commit used for reproduction.
9. Dashboard projections converge to MongoDB state after stream loss.
10. A Class-C plan never exceeds configured parallelism, duration, or environment-variation budgets.

## Testing strategy

- Unit tests for classification, consent, redaction, plan budgets, state transitions, and exact-versus-vector routing.
- Property tests for idempotency, tenant isolation, checkpoint replay, and Context Class invariants.
- Contract tests against recorded GitHub, Daytona, Fireworks, OTLP, Sentry, and Jira fixtures.
- Integration tests using a local fixture repository with one deterministic environment-specific bug.
- End-to-end tests for widget submission, class-C reproduction, evidence review, regression proof, and draft-PR gate.
- Security tests for prompt injection, malicious repository content, secret exfiltration, cross-tenant access, and artifact traversal.
- Accessibility checks plus keyboard and reduced-motion browser tests for all three V1 routes.
