# Tracecase UI Specification

## Product surfaces

Tracecase has two audiences and two intentionally different surfaces. The embedded widget reduces effort for the reporter. The authenticated product exposes detail and evidence for the engineering team.

## 1. Embedded reporter experience — `/intake`

### Host-page demonstration

The route shows a credible customer account page with a fixed `Report a problem` trigger. This proves the widget can live inside another product without becoming that product's main interface. The widget itself uses an isolated panel that can later ship as a script or web component.

### Conversation flow

1. Explain that Tracecase will ask a few questions and list the browser signals available.
2. Ask “What were you trying to do?”
3. Ask what happened instead, then select one missing high-value fact.
4. Offer screenshot or technical-detail collection with separate consent.
5. Show a structured review with `Expected`, `Observed`, `Steps`, `Environment`, and `Still unknown`.
6. Submit the report and show the Case identifier plus what happens next.

Only one question is active at a time. The reporter can go back, edit a confirmed answer, skip a non-required question, or choose `I don't know`. Copy is plain and must never blame the reporter.

### Widget states

- Closed trigger.
- Collection notice.
- Active question.
- Evidence-consent request.
- Uploading with progress.
- Review before submission.
- Submitted and investigation-started.
- Offline/retry state that preserves local draft.

## 2. Authenticated engineering product

### App shell

The shell includes a Tracecase mark, organization switcher, project selector, nav, help, and account menu. Desktop navigation is a restrained left rail. Mobile navigation becomes a standard drawer. Organizations and users appear as real tenancy controls, not decorative demo labels.

Primary navigation:

- Cases
- Runs
- Projects
- Connections
- Team
- Audit log

### Live runs — `/app/runs`

The live-run page answers four questions immediately:

1. What complaint is being investigated?
2. Which context class and search budget are active?
3. What is each environment doing now?
4. Has any environment reproduced the failure?

The environment wall is the main area. Tiles keep a stable position throughout the run. Each tile contains a mini browser frame, environment facts, current action, elapsed time, and a status label. Selecting a tile updates the evidence rail without navigation.

The top context bar includes Run ID, Case, branch/commit, Context Class, elapsed time, Worker count, and pause/stop controls. The right rail contains the evolving hypothesis, observed facts, unknowns, and ordered timeline. The interface never presents all of these as equivalent confidence.

### Change review — `/app/runs/run_2487/diff`

The review page is separate from the live Worker wall. It contains:

- Cause summary and confidence basis.
- Exact reproduced environment and evidence link.
- Regression test result before and after the patch.
- Changed-file navigation and unified diff.
- Test/check list with durations.
- Remaining uncertainty.
- Draft pull-request status and link.

The default focus is the changed code. Evidence and test results support the diff instead of competing with it.

## Visual direction

Use [DESIGN.md](../../DESIGN.md) as the token authority. The composition is a quiet white instrument surface with dense but legible information. Indigo marks actions and current selection. Cyan marks evidence context. Green, amber, and red are reserved for operational state.

Avoid gratuitous metric cards. A bordered region exists only when it groups controls, a Worker, evidence, or a distinct decision. Do not use glass effects, gradient text, fake terminal rain, or decorative AI imagery.

## Responsive behavior

- At 1200px and above: fixed sidebar, Worker wall plus evidence rail.
- Between 760px and 1199px: collapsed sidebar, two-column Worker wall, evidence rail below.
- Below 760px: one-column wall, sticky run context, full-width selected-Worker details.
- Widget becomes a full-height sheet below 640px.
- Diff keeps line numbers and code horizontally scrollable inside its own region; the page does not overflow.

## Accessibility checks

- Full route operation by keyboard.
- Persistent labels; placeholders are examples only.
- Logical heading order and landmarks.
- `aria-live="polite"` for non-critical run updates.
- Reduced motion disables live pulses.
- Tile status includes text, icon/shape, and color.
- Diff additions and removals have textual prefixes and screen-reader labels.
