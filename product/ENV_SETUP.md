# Tracecase environment setup

For this checkout, run `npm run env:provision` from `product/`. It repairs and completes the ignored root `.env` and `product/.env.local` files without replacing existing values. It generates Tracecase-owned secrets and reads the GitHub login, primary email, repository, and branch from the authenticated local tools when possible.

After provider credentials are complete, run `npm run env:sync-vercel`. This sends non-empty values to the linked Vercel Production environment through standard input. It does not print secret values. Environment changes require a new deployment.

Use `product/.env.local` on your computer. Use Vercel **Project → Settings → Environment Variables** for deployments. Vercel applies changed values only to new deployments, so redeploy after any edit. `NEXT_PUBLIC_` values are visible in the browser; every other credential must remain server-only. See [Vercel environment variables](https://vercel.com/docs/environment-variables).

## 1. Generate Tracecase values

Run these from `product/`. Each command prints a new value. Generate a different value for every secret.

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
node -e "console.log('org_'+require('crypto').randomBytes(8).toString('hex'))"
node -e "console.log('project_'+require('crypto').randomBytes(8).toString('hex'))"
node -e "console.log('pk_'+require('crypto').randomBytes(24).toString('base64url'))"
```

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_APP_URL` | Final HTTPS Vercel domain, with no trailing slash. |
| `AUTH_SECRET` | First random 32-byte value. Auth.js uses it to protect sessions. |
| `AUTH_TRUST_HOST` | Keep `true` on Vercel and in local development so Auth.js accepts the forwarded application host. |
| `TRACECASE_ALLOWED_GITHUB_LOGINS` | GitHub usernames allowed into the dashboard, comma-separated. Start with your own username. Sign-in is denied when this is blank. |
| `TRACECASE_OWNER_EMAIL` | Email on your GitHub account. Bootstrap grants it the owner role. |
| `TRACECASE_ORGANIZATION_ID` | Generated `org_…` value. |
| `TRACECASE_ORGANIZATION_NAME` | Company or team name for the active organization. |
| `TRACECASE_ORGANIZATION_SLUG` | Lowercase organization slug. |
| `TRACECASE_PROJECT_ID` | Generated `project_…` value. |
| `TRACECASE_PROJECT_NAME` | Your real product or repository name. |
| `TRACECASE_PROJECT_SLUG` | Lowercase letters, numbers, and hyphens. |
| `TRACECASE_TARGET_TEST_URL` | Staging or preview URL that workers may test. Do not use production yet. |
| `TRACECASE_TARGET_ALLOWED_DOMAINS` | Extra domains the tested page must load, comma-separated. The target hostname is added automatically. Add only required API, image, and asset hosts. |
| `TRACECASE_PRIVATE_SELECTORS` | Comma-separated selectors masked in every stored screenshot. Keep the supplied password and privacy selectors and add application-specific private areas. |
| `NEXT_PUBLIC_WIDGET_PROJECT_KEY` | Generated `pk_…` value. This is intentionally public. |
| `TRACECASE_WIDGET_ALLOWED_ORIGINS` | Exact websites allowed to embed the widget, comma-separated. |
| `WIDGET_SIGNING_SECRET` | New random 32-byte value. |
| `WORKER_SIGNING_SECRET` | New random 32-byte value. |
| `OTEL_INGEST_SECRET` | New random 32-byte value. Telemetry senders put it in `x-tracecase-ingest-secret`. |
| `CRON_SECRET` | New random 32-byte value. Add the same value as the GitHub repository secret `TRACECASE_CRON_SECRET`. |
| `MCP_API_KEY` | New random 32-byte value. MCP clients send it as a Bearer token. |
| `RUN_MAX_MINUTES` | Keep `15` initially. |
| `MAX_PARALLEL_ENVIRONMENTS` | Keep `12` initially. Lower it if sandbox quota is smaller. |

Keep `TRACECASE_RUNTIME_MODE=live`, `TRACECASE_PERSISTENCE=supabase`, `ALLOW_EXTERNAL_CALLS=true`, and `AUTO_DISPATCH_RUNS=true`. With automatic dispatch enabled, a submitted report creates a durable run and starts its Daytona coordinator after the reporter receives the response. Set it to `false` only when you want engineers to start runs manually from the run page. `FIREWORKS_BASE_URL` and `DAYTONA_API_URL` are provider endpoints, not secrets.

For local UI inspection without GitHub credentials, start the development server with `TRACECASE_UI_PREVIEW=true npm run dev`. This bypass exists only when `NODE_ENV=development`; it cannot open dashboard routes in a production build.

## 2. Supabase

1. Create a Supabase project and copy its project URL, publishable key, server secret key, project ID, and region.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. These values may reach the browser.
3. Set the server key as `SUPABASE_SECRET_KEY`. Never use `NEXT_PUBLIC_SUPABASE_SECRET_KEY`; that prefix exposes it to browser bundles.
4. Link and apply the checked-in database migration:

   ```powershell
   npx supabase link --project-ref YOUR_SUPABASE_PROJECT_ID
   npx supabase db push --linked --include-all
   npm run supabase:bootstrap
   npm run supabase:smoke
   ```

The migration enables `pgvector`, tenant indexes, RLS, atomic leases, hybrid semantic/full-text retrieval, a private `tracecase-artifacts` bucket, and Realtime publication. Fireworks generates 768-dimensional embeddings with `FIREWORKS_EMBEDDING_MODEL`; if embedding generation fails, full-text repository retrieval continues.

## 3. GitHub sign-in and repository access

Create one GitHub App at **GitHub → Settings → Developer settings → GitHub Apps → New GitHub App**. GitHub Apps start with no permissions, so grant only what Tracecase needs. See [GitHub App permissions](https://docs.github.com/en/enterprise-cloud@latest/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app).

| GitHub App field | Value |
| --- | --- |
| Homepage URL | `NEXT_PUBLIC_APP_URL` |
| Callback URL | `NEXT_PUBLIC_APP_URL/api/auth/callback/github` |
| Setup URL | `NEXT_PUBLIC_APP_URL/app/repositories` |
| Webhook URL | `NEXT_PUBLIC_APP_URL/api/integrations/github/webhook` |

Set repository permissions to **Metadata: Read**, **Contents: Read and write**, **Pull requests: Read and write**, **Checks: Read**, and **Actions: Read**. Subscribe to `installation`, `installation_repositories`, `push`, and `pull_request`. Do not grant administration, secrets, merge, or deployment permissions.

| Variable | Where to get it |
| --- | --- |
| `AUTH_GITHUB_ID` | GitHub App **Client ID**. |
| `AUTH_GITHUB_SECRET` | Generate a GitHub App **Client secret**. |
| `TRACECASE_ALLOWED_GITHUB_LOGINS` | Your GitHub username, plus any teammates who may open the private dashboard. Do not put display names or email addresses here. |
| `GITHUB_APP_ID` | GitHub App **App ID**. It is different from Client ID. |
| `GITHUB_APP_SLUG` | The slug in `github.com/apps/THIS-PART`. |
| `GITHUB_WEBHOOK_SECRET` | Generate another random value and paste it into GitHub’s Webhook secret field. |
| `GITHUB_APP_PRIVATE_KEY_BASE64` | Generate and download the App private key, then encode it below. |
| `TRACECASE_GITHUB_REPOSITORY_OWNER` | Owner of the repository Tracecase will repair. This lets `project:bootstrap` configure the repository before the webhook arrives. |
| `TRACECASE_GITHUB_REPOSITORY_NAME` | Repository name without `.git`. |
| `TRACECASE_GITHUB_DEFAULT_BRANCH` | Usually `main`. |
| `TRACECASE_GITHUB_INSTALLATION_ID` | Optional numeric App installation ID. Leave it blank if the installation webhook will populate it. |

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\your-app.private-key.pem"))
```

Protect the private key and delete the local copy after storing the Base64 value securely. Install the App on the one repository you want to test first. If the installation contains one repository, the signed webhook selects it automatically; otherwise set the repository variables above and rerun `npm run project:bootstrap`. Tracecase exchanges its signed App JWT for short-lived installation tokens instead of using a personal access token. See [GitHub private keys](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/managing-private-keys-for-github-apps) and [installation tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app).

## 4. Fireworks

1. Open [Fireworks](https://app.fireworks.ai/).
2. Open your profile → **User Settings → API Keys → Create API Key**. Copy it once into `FIREWORKS_API_KEY`. See the [Fireworks onboarding guide](https://docs.fireworks.ai/getting-started/onboarding).
3. Keep `FIREWORKS_BASE_URL=https://api.fireworks.ai/inference/v1`.
4. Set `FIREWORKS_MODEL` to the exact model or deployment resource shown by Fireworks. Kimi K2.5 uses `accounts/fireworks/models/kimi-k2p5`, supports vision and function calling, and currently requires an on-demand deployment rather than serverless access. Use your Fireworks credits for that deployment, or select a model marked **Serverless** in the model library. See [Kimi K2.5 on Fireworks](https://fireworks.ai/models/fireworks/kimi-k2p5) and the [vision guide](https://docs.fireworks.ai/guides/querying-vision-language-models).

## 5. Daytona

1. Open the [Daytona dashboard](https://app.daytona.io/dashboard/keys).
2. Click **Create Key**, name it `tracecase-vercel`, set an expiry, and grant sandbox create/read/write/delete plus organization-secret create/read/delete permissions. Tracecase creates short-lived egress-restricted Secret objects for each run and removes them when the coordinator finishes.
3. Copy it into `DAYTONA_API_KEY`.
4. Keep `DAYTONA_API_URL=https://app.daytona.io/api` and set `DAYTONA_TARGET=us` or `eu`.

Keep these matching values unless Daytona changes its supported images:

```env
DAYTONA_ORCHESTRATOR_IMAGE=node:22-bookworm-slim
DAYTONA_BROWSER_IMAGE=mcr.microsoft.com/playwright:v1.55.0-noble
PLAYWRIGHT_VERSION=1.55.0
```

The key must be allowed to create and delete more than one sandbox. One sandbox coordinates the run, each browser environment receives its own sandbox, and one secret-free verifier sandbox executes repository tests. The coordinator receives opaque Daytona Secret placeholders for Fireworks, Daytona, and the short-lived GitHub installation token. Daytona substitutes their real values only on requests to the allowed provider hosts. The coordinator also receives the callback-signing secret because it must compute an HMAC locally. It never runs repository install, start, build, or test commands. Browser workers receive no provider credential. The verifier executes repository code but receives no provider credential.

Daytona is Linux. Its mobile profiles are emulation and remain labeled as such. Genuine non-Linux execution is provided only by the BrowserStack connection below.

Daytona documents these exact environment names and API URL in its [API key guide](https://www.daytona.io/docs/api-keys).

## 6. Genuine Windows, macOS, Android, and iOS

Tracecase uses BrowserStack Automate for these platforms:

```env
REAL_DEVICE_PROVIDER=browserstack
BROWSERSTACK_USERNAME=YOUR_AUTOMATE_USERNAME
BROWSERSTACK_ACCESS_KEY=YOUR_AUTOMATE_ACCESS_KEY
```

Find the username and access key in BrowserStack account settings. The planner then adds Windows 11 Chrome/Edge and macOS Safari cloud VMs, plus physical Pixel and iPhone browser sessions. Each action posts a signed masked frame to the private run wall. After completion, Tracecase embeds BrowserStack’s recorded session video when its API returns a video URL. See BrowserStack’s [desktop platforms](https://www.browserstack.com/docs/automate/playwright/browsers-and-os), [physical mobile capabilities](https://www.browserstack.com/docs/automate/selenium/select-browsers-and-devices), and [session API](https://www.browserstack.com/docs/automate/api-reference/selenium/session).

This connection is required for genuine Windows, macOS, Android, or iOS. Set `REAL_DEVICE_PROVIDER=none` when it is absent. BrowserStack account limits determine concurrency and availability.

## 7. Optional imports

Leave these blank unless the target company uses the provider.

For Sentry, open **Organization Settings → Developer Settings → Custom Integrations**, create an internal integration, and copy its token into `SENTRY_AUTH_TOKEN`. Grant only the read scopes needed for issues and events. `SENTRY_ORG` is the organization slug and `SENTRY_PROJECT` is the project slug shown in Sentry project settings, not the display name. See [Sentry authentication tokens](https://docs.sentry.io/api/guides/create-auth-token/).

For Jira Cloud:

- `JIRA_BASE_URL`: your site root, such as `https://your-company.atlassian.net`, with no trailing slash.
- `JIRA_EMAIL`: the Atlassian account email that owns the token.
- `JIRA_API_TOKEN`: create one in Atlassian account security and copy it once. See [Atlassian API tokens](https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/).
- `JIRA_PROJECT_KEY`: the short prefix before an issue number, for example `ENG` in `ENG-142`.

These are server-only. The core path does not require Sentry or Jira.

## 8. MCP, delayed intake, and release controls

The MCP endpoint is `NEXT_PUBLIC_APP_URL/api/mcp`. It exposes `list_cases`, `get_run`, and `start_run`; every request needs `MCP_API_KEY` as a Bearer token.

Vercel invokes `/api/cron/intake-timeouts` daily. `.github/workflows/intake-timeouts.yml` also invokes it hourly, so an unanswered intake normally continues between 24 and 25 hours after its last update. Add the GitHub Actions secret `TRACECASE_CRON_SECRET` with the same value as Vercel’s `CRON_SECRET`.

Release automation is fail-closed:

```env
ALLOW_AUTO_MERGE=false
ALLOW_AUTO_DEPLOY=false
VERCEL_DEPLOY_HOOK_URL=
```

Run `npm run project:bootstrap` after changing either flag because the durable project policy is authoritative. Auto-merge still requires the full proof gate. Auto-deploy runs only after a successful merge and only when a Vercel deploy hook is present. Branch protection or failed checks can still reject the merge.

## 9. Add values to Vercel

1. Import the repository into Vercel.
2. Set **Root Directory** to `product`. Vercel detects Next.js automatically.
3. Add every required variable to **Production**, **Preview**, and **Development** as appropriate. Mark secrets as **Sensitive**.
4. Deploy once, then replace `NEXT_PUBLIC_APP_URL` with the final domain if it changed.
5. Update the GitHub callback, setup, and webhook URLs to that same domain.
6. Redeploy. Environment changes do not affect older deployments.
7. Run `npm run connections:check` locally with the Vercel development values to find missing entries.

## 10. Activate and prove the complete path

After every value is present:

1. Run `npx supabase db push --linked --include-all`.
2. Run `npm run supabase:bootstrap` and `npm run supabase:smoke`.
3. Install the GitHub App and confirm the repository page shows `owner/repository` as **Connected**.
4. Submit a report against a disposable staging repository. Do not use production for the first activation.
5. Open its run. The expected progression is `queued → dispatching → planning → running → fixing → verified`.
6. Confirm Supabase contains the redacted evidence bundle and private screenshot artifacts.
7. Confirm the regression test fails on the untouched commit and passes with the patch.
8. Confirm GitHub contains one `tracecase/...` branch and one draft PR with both release flags false.
9. If genuine platforms are required, confirm every BrowserStack tile says **Cloud VM** or **Real device**, shows changing frames, and offers a replay after completion.
10. Test auto-merge and deployment only in a disposable repository after the review-only path passes.

If automatic dispatch cannot start, the run becomes `failed` with a redacted reason. Correct the connection and press **Retry** on the run page. A report that does not reproduce ends as `not_reproduced`. A reproduced report whose patch fails any proof gate ends as `diagnosis_only`; no branch or PR is created.

`VERCEL_GIT_COMMIT_SHA` is supplied by Vercel automatically. Do not add it yourself. Tracecase records it with each run when Vercel provides it.
