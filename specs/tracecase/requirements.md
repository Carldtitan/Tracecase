# Requirements Document

## Introduction

Tracecase is an agentic bug-reproduction and repair product. It accepts incomplete reports through an embeddable website widget, enriches them with repository and optional telemetry context, runs controlled browser environments, proves whether the failure is reproducible, and proposes a tested pull request when the evidence supports a fix.

The product does not claim that every complaint is reproducible. It preserves unknowns, separates observed facts from model inference, and requires human approval at production-access and merge boundaries.

### Non-negotiable product rules

1. The system must do real work: execute environments, collect evidence, run tests, and create a reviewable code change.
2. MongoDB stores structured operational memory and powers exact plus semantic context retrieval.
3. Exact identifiers use database queries, not vector search.
4. Secret values never enter MongoDB, model prompts, screenshots, or run artifacts.
5. A fix is not complete without a reproduced failure and a passing regression test in a comparable environment.
6. Unknown user state remains unknown; the agent may test hypotheses but may not present them as facts.
7. Production access and code merge remain explicit human-controlled boundaries.

## Glossary

- **Case**: The canonical record created from one or more reports about a possible product failure.
- **Report**: A reporter's original complaint, attachments, answers, and consented client signals.
- **Investigation Run**: One bounded attempt to reproduce and diagnose a Case.
- **Worker**: An isolated environment that executes a test hypothesis.
- **Context Class A**: Full incident-specific context is available, such as replay, trace, exact release, and user environment.
- **Context Class B**: Some incident-specific context is available, but one or more material facts are missing.
- **Context Class C**: No incident-specific runtime context is available; the system still has the repository, target app, and authorized test access.
- **Observed Fact**: Evidence directly produced by a report, repository, telemetry source, or Worker.
- **Inference**: An agent conclusion that is supported but not directly observed.
- **Unknown**: A material fact for which the system has no adequate evidence.
- **Evidence Bundle**: Screenshots, video, console and network events, traces, environment definition, steps, and test results tied to one reproduction.
- **Repository Context**: Versioned code, dependency, ownership, release, test, and historical-decision information connected to a Project.

## V1 Requirements — Mandatory Product Build

### Requirement 1: Organizations, users, and projects

**User Story:** As an engineering lead, I want work isolated by organization and project so that teams can safely use one Tracecase deployment.

#### Acceptance Criteria

1. WHEN a User signs in, THE System SHALL show only Organizations and Projects to which the User belongs.
2. WHEN an Organization owner invites a User, THE System SHALL assign one of `owner`, `admin`, `engineer`, `support`, or `viewer`.
3. WHEN a Project is created, THE System SHALL generate a rotatable public widget key and a separate server-side signing secret.
4. WHEN any Project-scoped record is read or changed, THE System SHALL enforce Organization and Project ownership server-side.

### Requirement 2: Project connection setup

**User Story:** As a platform engineer, I want to connect the systems Tracecase needs so that investigations have real code and execution access.

#### Acceptance Criteria

1. WHEN a Project is onboarded, THE System SHALL require a GitHub repository, target test URL, MongoDB configuration, Fireworks model, and Daytona account before live investigation is enabled.
2. WHEN optional Sentry or Jira credentials are absent, THE System SHALL keep intake and investigation usable.
3. WHEN a connection is tested, THE System SHALL show its granted scope, last successful check, and any missing permission.
4. WHEN a credential is stored, THE System SHALL encrypt it outside prompt-visible and vector-indexed fields.

### Requirement 3: Embeddable reporter widget

**User Story:** As a product user, I want to report a problem without leaving the page where it happened.

#### Acceptance Criteria

1. WHEN a host site loads the Tracecase script with a valid Project key, THE System SHALL render an isolated report trigger without changing host styles.
2. WHEN the reporter opens the widget, THE System SHALL retain the current page URL, locale, viewport, browser family, and app release only after displaying the collection notice.
3. WHEN JavaScript embedding is unavailable, THE System SHALL provide a hosted intake URL with equivalent questions.
4. WHEN the widget closes and reopens in the same session, THE System SHALL restore unsent answers locally.

### Requirement 4: Agentic intake and follow-up

**User Story:** As a reporter, I want the product to ask relevant follow-up questions so that I do not need to know how to write a technical bug report.

#### Acceptance Criteria

1. WHEN a reporter describes a failure, THE Intake Agent SHALL identify the smallest set of missing facts that could change an investigation plan.
2. WHEN more information is needed, THE Intake Agent SHALL ask one plain-language question at a time and explain why sensitive evidence is requested.
3. WHEN an answer conflicts with an earlier answer, THE Intake Agent SHALL ask for clarification rather than silently replacing a confirmed fact.
4. WHEN the reporter stops responding, THE System SHALL create a Case after the configured timeout and mark unanswered facts as Unknown.
5. WHEN the report is sufficient, THE System SHALL summarize the expected behavior, observed behavior, steps, impact, and known environment for confirmation.

### Requirement 5: Consent and evidence minimization

**User Story:** As a reporter, I want control over what the widget collects so that I can report a problem without exposing private data.

#### Acceptance Criteria

1. WHEN screenshot, console, network, replay, or account context is requested, THE System SHALL request separate informed consent for that evidence type.
2. WHEN evidence is captured, THE System SHALL mask configured selectors, tokens, authorization headers, cookies, and secret-like values before upload.
3. WHEN consent is declined, THE System SHALL continue with less context and record the missing evidence as Unknown.
4. WHEN a reporter requests deletion, THE System SHALL remove report-owned attachments and derived embeddings according to Organization retention rules.

### Requirement 6: Canonical cases and duplicate reports

**User Story:** As a support lead, I want related complaints consolidated without losing their original wording.

#### Acceptance Criteria

1. WHEN a Report is submitted, THE System SHALL preserve the original content and create or attach it to a canonical Case.
2. WHEN possible duplicates are found, THE System SHALL use exact release, route, error signature, and semantic similarity as separate signals.
3. WHEN duplicate confidence is below the configured threshold, THE System SHALL propose a merge for human review rather than merge automatically.
4. WHEN multiple reports attach to one Case, THE System SHALL retain the provenance and consent boundary of each Report.

### Requirement 7: Repository context ingestion

**User Story:** As an engineer, I want Tracecase to understand my repository so that its reproduction plan and fix reflect how the product is actually built.

#### Acceptance Criteria

1. WHEN a GitHub repository is connected, THE System SHALL index the default branch, dependency manifests, routes, tests, ownership files, recent releases, and relevant commit history.
2. WHEN an exact path, symbol, commit, issue, or release is requested, THE System SHALL use indexed fields or repository APIs before semantic retrieval.
3. WHEN semantic context is needed, THE System SHALL use Atlas Vector Search over code, runbooks, past Cases, and prior decisions with source metadata.
4. WHEN the repository changes, THE System SHALL update only affected chunks and retain the source commit for every indexed chunk.
5. WHEN context is sent to a model, THE System SHALL include source paths and commits and exclude secret values and ignored files.

### Requirement 8: Telemetry connection and correlation

**User Story:** As an incident responder, I want runs correlated with logs, network activity, and traces so that the agent can distinguish UI symptoms from backend causes.

#### Acceptance Criteria

1. WHEN the target app emits OpenTelemetry, THE System SHALL correlate Worker actions with traces and logs using a unique run correlation ID.
2. WHEN Sentry is connected, THE System SHALL retrieve only authorized issue, event, release, trace, and replay metadata relevant to the Case.
3. WHEN no telemetry source is connected, THE System SHALL still capture browser console, request, response, and timing evidence from its own Workers.
4. WHEN telemetry contradicts a model hypothesis, THE System SHALL keep the telemetry as authority and revise the hypothesis.

### Requirement 9: Context-class assignment

**User Story:** As an engineer, I want the search breadth to match the available evidence so that the system does not waste time or overstate precision.

#### Acceptance Criteria

1. WHEN an Investigation starts, THE System SHALL assign Context Class A, B, or C using deterministic evidence rules and show the reason.
2. WHEN new evidence arrives, THE System SHALL allow the class to narrow from C to B or A without discarding completed evidence.
3. WHEN a class is assigned, THE System SHALL bound the number, duration, and allowed variation of Workers using Project policy.
4. WHEN the class is C, THE System SHALL vary hypotheses adaptively rather than execute the full Cartesian product of all configurations.

### Requirement 10: Environment planning and orchestration

**User Story:** As a QA engineer, I want multiple isolated environments to test plausible configurations so that environment-specific failures can be discovered quickly.

#### Acceptance Criteria

1. WHEN a plan is approved or auto-approved by policy, THE Orchestrator SHALL create isolated Daytona workspaces with pinned repository commit, dependencies, and browser profile.
2. WHEN Workers execute, THE System SHALL support Chromium browser, viewport, locale, timezone, color scheme, feature flag, network, authentication fixture, and seeded-data variations.
3. WHEN Apple-specific verification is required, THE System SHALL dispatch the configured GitHub Actions macOS/iOS workflow and label it as a distinct environment source.
4. WHEN one Worker produces new evidence, THE Planner SHALL rank or cancel remaining hypotheses based on expected information gain.
5. WHEN a Worker exceeds time or resource limits, THE System SHALL terminate it, preserve partial evidence, and show the reason.

### Requirement 11: Reproduction proof

**User Story:** As an engineer, I want a reproducible failure with inspectable evidence so that I can trust the diagnosis.

#### Acceptance Criteria

1. WHEN a Worker claims reproduction, THE System SHALL require a deterministic observable assertion that fails against the pinned baseline.
2. WHEN a failure is reproduced, THE System SHALL save exact steps, environment definition, screenshot or video, console and network evidence, correlated traces, and assertion output.
3. WHEN the behavior cannot be reproduced within the budget, THE System SHALL report `not reproduced within tested scope`, list tested hypotheses, and preserve Unknowns.
4. WHEN reproduction depends on unsupported or unavailable hardware, THE System SHALL label the limitation instead of substituting an equivalent claim.

### Requirement 12: Diagnosis, regression test, and patch

**User Story:** As an application owner, I want a small tested fix so that I can review a credible change instead of a broad rewrite.

#### Acceptance Criteria

1. WHEN reproduction is proven, THE Fix Agent SHALL retrieve relevant repository context and identify a smallest plausible change.
2. WHEN a patch is generated, THE System SHALL first create or update a regression test that fails on the baseline.
3. WHEN the patch is applied, THE System SHALL rerun the regression test and the reproduction environment and record both results.
4. WHEN unrelated tests fail, THE System SHALL separate pre-existing failures from regressions caused by the patch.
5. WHEN no safe patch is found, THE System SHALL retain the diagnosis and evidence without opening a misleading pull request.

### Requirement 13: GitHub branch and pull request

**User Story:** As an engineer, I want the final proposal in my normal review workflow.

#### Acceptance Criteria

1. WHEN a tested patch is ready, THE System SHALL create a dedicated branch and draft pull request through the installed GitHub App.
2. WHEN the pull request is created, THE System SHALL include the linked Case, reproduction steps, evidence, regression test, before/after results, and remaining uncertainty.
3. WHEN Project policy requires approval, THE System SHALL pause before branch push or pull-request creation.
4. THE System SHALL never merge a pull request or deploy to production in V1.

### Requirement 14: Live investigation dashboard

**User Story:** As an engineer, I want to watch the investigation across environments so that I can understand what the agents are doing.

#### Acceptance Criteria

1. WHEN an Investigation is active, THE Dashboard SHALL show a stable tile for every Worker with environment, current action, elapsed time, and status text.
2. WHEN Worker state changes, THE Dashboard SHALL update without reordering tiles or stealing focus.
3. WHEN a User selects a Worker, THE Dashboard SHALL show its evidence, action history, hypothesis, and latest browser state.
4. WHEN an action is inferred rather than observed, THE Dashboard SHALL label it as an inference.
5. WHEN the display is narrow, THE Dashboard SHALL preserve access to every Worker and the investigation rail without horizontal page overflow.

### Requirement 15: Review and code-diff page

**User Story:** As a code reviewer, I want the final evidence and diff on a dedicated page so that live execution and change review do not compete for attention.

#### Acceptance Criteria

1. WHEN a patch exists, THE System SHALL provide a separate review route from the live Worker wall.
2. THE Review Page SHALL show cause summary, confidence basis, reproduced environment, failing baseline test, passing patched test, changed files, and unified diff.
3. WHEN evidence is selected, THE Review Page SHALL navigate to the exact associated Worker artifact or repository source.
4. WHEN a draft pull request exists, THE Review Page SHALL show its branch, commit, checks, and external GitHub link.

### Requirement 16: MongoDB operational memory

**User Story:** As a product engineer, I want one durable operational record so that agent decisions can be resumed, audited, and improved.

#### Acceptance Criteria

1. THE System SHALL store Organizations, Projects, Reports, Cases, Runs, Workers, observations, hypotheses, decisions, artifacts, and repository chunk metadata in MongoDB Atlas.
2. WHEN an exact entity is known, THE System SHALL retrieve it by indexed identifier and tenant boundary.
3. WHEN contextual precedent is useful, THE System SHALL use Atlas Vector Search over approved non-secret content.
4. WHEN a run is retried, THE System SHALL resume from persisted checkpoints and shall not repeat a completed external side effect.
5. WHEN an agent action is stored, THE System SHALL include inputs by reference, evidence references, tool result, model, prompt version, actor, timestamp, and idempotency key.

### Requirement 17: Reliability and safe retries

**User Story:** As an operator, I want interrupted investigations to recover without duplicate branches, comments, or charges.

#### Acceptance Criteria

1. WHEN a step begins, THE System SHALL create a lease and checkpoint before performing an external side effect.
2. WHEN a transient failure occurs, THE System SHALL retry with bounded exponential backoff and the same idempotency key.
3. WHEN a lease expires, THE System SHALL allow another Worker to resume from the last complete checkpoint.
4. WHEN a non-retryable permission or policy error occurs, THE System SHALL pause the run and name the required human action.

### Requirement 18: Security and production access

**User Story:** As a security owner, I want least-privilege controls so that an autonomous investigation cannot become a new production risk.

#### Acceptance Criteria

1. THE System SHALL use short-lived scoped credentials for Workers wherever the provider supports them.
2. WHEN production access is granted, THE System SHALL record approver, scope, reason, start time, and expiry.
3. THE System SHALL deny direct access to production databases, unrestricted shell credentials, cookie stores, and deploy keys unless a Project policy explicitly allows a scoped fixture.
4. WHEN artifacts are stored, THE System SHALL scan and redact secret-like values before persistence.
5. WHEN an audit event occurs, THE System SHALL append an immutable organization-scoped record.

### Requirement 19: Accessible, restrained product interface

**User Story:** As any user, I want the product to remain understandable and operable under time pressure.

#### Acceptance Criteria

1. THE Interface SHALL target WCAG 2.2 AA, support complete keyboard operation, and show visible focus.
2. THE Interface SHALL communicate status through text and structure in addition to color.
3. WHEN reduced motion is requested, THE Interface SHALL remove non-essential animation.
4. THE Interface SHALL use plain language for reporter questions and preserve precise technical language for engineering evidence.

### Requirement 20: Free core path and bounded demo mode

**User Story:** As the builder, I want the core product to run on available credits and open tools without surprise mandatory spend.

#### Acceptance Criteria

1. THE mandatory path SHALL use the provided MongoDB Atlas, Fireworks, and Daytona allocations plus GitHub, Playwright, and OpenTelemetry.
2. THE mandatory path SHALL NOT require Sentry, Jira, Datadog, a paid device farm, or any paid speech provider.
3. WHEN an optional provider has no free allowance or provided credit, THE System SHALL keep it disabled by default and label its cost boundary.
4. THE demo fixture SHALL complete one class-C investigation path within a configured two-minute stage budget while preserving the same contracts as a full run.

## Out of Scope for V1

- Automatic merge or production deployment.
- Unattended browsing of real customer accounts without explicit scoped authorization.
- Native physical-device streaming.
- Full cross-browser parity beyond the configured Worker profiles.
- Replacing Jira, Sentry, Zendesk, or GitHub as their system of record.
- Claiming a bug does not exist when it was only not reproduced within tested scope.
