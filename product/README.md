# Tracecase

Tracecase is an engineering agent with two jobs: review incoming pull requests, and turn hard-to-reproduce customer bugs into evidence-backed fixes and tested pull requests.

## Surfaces

- `/` — GitHub sign-in.
- `/app` — authenticated engineering dashboard.
- `/app/cases` — customer reports.
- `/app/runs` — investigations.
- `/app/repositories` — repository connection.
- `/app/connections` — service configuration.
- `/app/settings` — reporter and workspace settings.
- `/intake` — isolated public reporter iframe.
- `/tracecase-widget.js` — embeddable reporter loader.
- `/api/mcp` — authenticated Streamable HTTP MCP endpoint.

The dashboard never links to the reporter. The reporter receives a public project key, checks its host origin, and cannot access the dashboard session.

## Start

1. Complete [ENV_SETUP.md](./ENV_SETUP.md).
2. Install and validate:

   ```powershell
   npm install
   npm run typecheck
   npm run test
   ```

3. Prepare Supabase:

   ```powershell
   npx supabase link --project-ref YOUR_PROJECT_ID
   npx supabase db push --linked --include-all
   npm run supabase:bootstrap
   npm run supabase:smoke
   ```

4. Run:

   ```powershell
   npm run dev
   ```

   To inspect dashboard UI locally before configuring GitHub, use `TRACECASE_UI_PREVIEW=true npm run dev`. Preview mode is development-only.

## Embed

```html
<script src="https://YOUR-TRACECASE-DOMAIN/tracecase-widget.js" defer></script>
<tracecase-widget
  base-url="https://YOUR-TRACECASE-DOMAIN"
  project-key="YOUR-PUBLIC-PROJECT-KEY">
</tracecase-widget>
```

The widget accepts a short conversation plus image or file attachments. Its public key cannot access the engineering dashboard or the Supabase secret key.

## Deploy

Import the repository into Vercel, set the Root Directory to `product`, add the variables from `.env.example`, and deploy. The application uses standard Next.js commands.

Tracecase creates a draft pull request by default. Explicit project policy can allow a fully proved patch to be squash-merged and sent to a Vercel deploy hook.

## Automated code review

When the GitHub App receives an `opened`, `reopened`, `synchronize`, or `ready_for_review` pull-request webhook, Tracecase reads the diff and changed files, retrieves related repository memory, asks Fireworks for concrete correctness and security findings, and posts a GitHub review. Inline comments are accepted only on verified added lines; broader findings remain in the review summary. Delivery checkpoints prevent duplicate reviews.

## Live investigation path

With all required connections configured and `AUTO_DISPATCH_RUNS=true`, a submitted report starts a remote investigation:

```text
report → durable intake → Daytona coordinator → isolated browser/real-device sessions
       → Fireworks visual evidence → secret-isolated patch verifier → Supabase evidence
       → GitHub pull request → optional merge → optional deployment
```

The GitHub change gate requires a failed regression test on the untouched commit, a passing patched test in the same verifier, passing relevant checks, and an already reproduced customer failure. Missing proof ends the run at diagnosis without changing GitHub. See [ENV_SETUP.md](./ENV_SETUP.md) for provider activation and the first disposable-repository test.

Supabase Postgres holds tenant-scoped operational state, exact identifiers, checkpoints, leases, audit events, and repository chunks. `pgvector` plus Fireworks embeddings provides semantic repository memory, with PostgreSQL full-text search as a fallback. Supabase Storage holds private screenshots and reporter attachments. Realtime publication supports live run updates without exposing the server secret.

Reporter uploads, generated follow-ups, and incomplete reports are durable. An hourly schedule continues a report after its 24-hour response window. During a run, the dashboard shows signed masked frames; BrowserStack sessions add Windows/macOS cloud VMs, physical Android/iOS devices, and completed session video. Without BrowserStack credentials, only explicitly labeled Daytona/Linux profiles run.
