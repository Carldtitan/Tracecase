---
name: Tracecase
description: Calm, evidence-first infrastructure for turning bug reports into reproducible engineering cases.
colors:
  espresso-950: "#23150f"
  espresso-900: "#2d1b14"
  espresso-800: "#3d281f"
  brown-700: "#614537"
  brown-500: "#8b6f5f"
  brown-300: "#c8b3a3"
  oat-100: "#f2e9dc"
  oat-50: "#f8f2e8"
  ivory: "#fffaf2"
  paper: "#fffdf9"
  terracotta: "#b85632"
  terracotta-dark: "#914126"
  sage: "#3f765c"
  amber: "#a46d24"
typography:
  display:
    fontFamily: "Georgia, Times New Roman, serif"
    fontSize: "clamp(34px, 4vw, 48px)"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "-0.04em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, sans-serif"
    fontSize: "13px"
  metadata:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, sans-serif"
    fontSize: "11px"
    fontWeight: 700
rounded:
  sm: "10px"
  md: "15px"
  lg: "22px"
spacing:
  compact: "8px"
  control: "16px"
  section: "24px"
  page: "32px"
components:
  button-primary:
    backgroundColor: "{colors.terracotta}"
    textColor: "{colors.ivory}"
    rounded: "11px"
    padding: "0 16px"
    height: "40px"
  card:
    backgroundColor: "{colors.ivory}"
    textColor: "{colors.espresso-950}"
    rounded: "{rounded.lg}"
---

# Design System: Tracecase

## Overview

**Creative North Star: “The Warm Control Room”**

Tracecase combines the calm clarity of a native productivity app with the seriousness of engineering infrastructure. Warm oat canvases, espresso navigation, paper-like work surfaces, and restrained terracotta actions make the product feel human without turning it into a lifestyle interface. The finish may feel Apple-influenced through spacing, hierarchy, and tactility, but it must not copy Apple assets or platform chrome.

The interface is quiet by default. One decision dominates each screen; secondary details stay compact and structured. Evidence, uncertainty, permissions, and public/private boundaries remain explicit even when the visual treatment is minimal.

## Colors

The palette is warm and low-chroma. Espresso establishes authority, oat and ivory reduce glare, and terracotta identifies action.

- **Espresso:** primary ink, private navigation, code surfaces, and user chat messages.
- **Oat:** application canvas and public-page background.
- **Ivory and paper:** raised work surfaces, fields, cards, and agent messages.
- **Terracotta:** primary actions, current context, focus, and product mark. It is functional, not decorative.
- **Sage:** complete or ready states.
- **Amber:** incomplete, needed, or attention states.
- **Brown neutrals:** metadata, dividers, supporting labels, and inactive navigation.

Use translucent espresso lines for boundaries: `rgba(77, 48, 35, 0.13)` at rest and `rgba(77, 48, 35, 0.22)` for stronger control edges.

## Typography

- **Display:** Georgia or Times New Roman, medium weight, tight tracking. Use for page titles, sign-in statements, and meaningful empty-state headings.
- **Interface:** the Apple/system sans stack (`-apple-system`, `BlinkMacSystemFont`, `SF Pro Text`, `Segoe UI`, sans-serif). Use for navigation, controls, body copy, status, and chat.
- **Monospace:** the platform monospace stack for code, references, hashes, and machine output.
- Dashboard titles use `clamp(34px, 4vw, 48px)` with a 1.0 line-height. The sign-in statement may scale to 70px.
- Interface copy is usually 13px. Supporting metadata is 9–11px but must remain readable.
- Uppercase eyebrows are reserved for short context labels such as the current section or workspace. Do not use them as decorative preludes to every heading.

## Layout

- The private app uses a sticky 246px espresso sidebar and a flexible oat work canvas.
- Dashboard content is centered at a maximum width of 1140px with 32px desktop gutters and 48px top spacing.
- Primary dashboard modules are wide and shallow enough to scan quickly. Supporting actions use simple three-column card grids.
- Record indexes use a single full-width list. Detail pages use a two-column evidence grid with the primary summary slightly wider than supporting context.
- Investigation pages stack a compact run summary, environment matrix, outcome, proposed diff, and agent timeline in that evidence order.
- At 900px and below, the sidebar becomes an off-canvas drawer and a translucent 60px mobile header appears.
- At 650px and below, dashboard gutters reduce to 12px per side; tracks, quick actions, settings, detail grids, and split cards collapse to one or two columns as their content permits. Record arrows disappear, summary facts stack, and the environment matrix becomes one column.
- The public reporter is a separate 420px by 656px surface. It becomes fluid within a 12px viewport inset and must not inherit the private dashboard shell.

## Elevation & Depth

Depth is warm, soft, and vertical. It separates tools without creating glassy layers or glow.

- **Card:** `0 1px 0 rgba(255,255,255,.9) inset, 0 14px 34px rgba(69,43,29,.08), 0 2px 6px rgba(69,43,29,.05)`.
- **Floating surface:** `0 24px 70px rgba(57,34,23,.19), 0 3px 12px rgba(57,34,23,.08)` for sign-in and the public reporter.
- **Primary action:** a short terracotta shadow plus a subtle inner highlight.
- **Dark inset surface:** use an inward shadow for code and machine-readable content.

Use a fine translucent border with a soft shadow when a module needs a complete edge. Avoid decorative blur; the limited blur on mobile chrome and sign-in supports hierarchy and legibility.

## Shapes

- The core radius scale is 10px, 15px, and 22px.
- Buttons and compact controls use 10–11px corners.
- Dashboard cards use 15–22px corners.
- Floating public surfaces may use 24–28px corners.
- Status pills and avatars are fully rounded.
- Icon containers are softly squared, usually 9–17px, rather than circular by default.

## Components

### Buttons and icon controls

- Primary buttons are terracotta with ivory text, 40px minimum height, and a strong verb label.
- Secondary buttons are ivory with a brown line and low shadow.
- Icon-only controls use familiar line icons and always include an accessible name. Their hover state is a translucent espresso wash.
- Each screen should have one visually dominant primary action.

### Private shell

- Navigation pairs familiar line icons with short labels.
- Active navigation uses a lighter espresso surface, a faint edge, and terracotta icon color.
- Workspace and signed-in identity stay visible but visually subordinate to navigation.
- The account row belongs at the bottom of the sidebar.
- On mobile, the navigation drawer behaves as a modal: move focus into it, trap focus, close on Escape or scrim activation, mark the closed drawer inert, and restore focus to the menu trigger.

### Cards, lists, and status

- Hero and empty-state cards use ivory surfaces, fine brown edges, and the card shadow.
- Repeated setup or connection records use aligned icon, label, status, and action columns.
- Status pills pair a text label with a dot. Never communicate state by color alone.
- Code, embed snippets, and technical identifiers use dark espresso or monospace treatment.

### Record lists and detail cards

- Case and run indexes use 78px minimum-height rows with one primary label, one concise metadata line, a text status, and a directional affordance.
- Long record labels and metadata truncate on one line instead of widening the layout.
- Detail cards use the standard ivory card treatment. Summary facts sit in smaller paper cells; exact identifiers use compact code tags; unknowns remain plain readable lists.
- Related records use a nested list inside the wide detail card. Avoid creating a second elevated card inside the first.

### Investigation workspace

- The environment matrix uses responsive cards with a fixed 16:9 visual region and a compact footer for browser, state profile, and status.
- Environment state must use text and iconography in addition to the muted warm status tint. Empty worker and evidence states use a quiet dashed panel.
- Proposed changes use stacked espresso diff surfaces with a monospace file header and independently scrollable code body. Preserve whitespace and permit horizontal code scrolling rather than wrapping diffs.
- The agent timeline is an ordered vertical sequence. Each event pairs a terracotta node with a concise summary, agent identity, and time; it is evidence chronology, not decorative activity.
- Outcome cards keep the result status and summary prominent. Uncertainty remains visible directly beneath the result.

### Public reporter boundary

- The reporter is a small support conversation, not a miniature dashboard.
- Ask one plain-language question at a time. Agent messages use ivory; reporter messages use espresso.
- Keep the composer fixed beneath the conversation with text, optional on-device voice input, and one send action.
- Show consent immediately before submission. State the narrow collection boundary in short language, including that passwords and cookies are not collected.
- A project key configures the public reporter. Authentication, navigation, repository access, evidence, and private dashboard state never appear in this surface.
- Embedded reporter mode adds a plainly labeled close icon beside the voice control. It asks the parent surface to close through the embedding contract; it does not navigate into private product routes.
- Missing configuration, sending, success, and retry states must fit inside the same reporter frame without layout jumps.

## Do's and Don'ts

### Do

- **Do** use short labels, direct questions, and one-sentence empty states.
- **Do** use verb-first actions such as “Connect GitHub,” “Send report,” and “Try again.”
- **Do** preserve visible focus with the terracotta 3px ring and 3px offset.
- **Do** support keyboard navigation, meaningful landmarks, `aria-current`, live-region updates, and accessible names for icon controls.
- **Do** preserve record order and timeline order in semantic links and ordered lists so screen readers receive the same evidence structure.
- **Do** pair every state color with text or shape and honor `prefers-reduced-motion`.
- **Do** keep uncertainty, permissions, and public/private limits visible.

### Don't

- **Don't** explain standard navigation or obvious controls with paragraphs.
- **Don't** use gradients, glass cards, glow, or purple AI-dashboard styling as the product identity.
- **Don't** crowd a screen with multiple primary actions or nested cards.
- **Don't** use placeholder telemetry, fake activity, or fabricated evidence as visual decoration.
- **Don't** shrink operational metadata below legible sizes to create empty space.
- **Don't** imply that Tracecase can merge, deploy, or access private systems from the public reporter.
