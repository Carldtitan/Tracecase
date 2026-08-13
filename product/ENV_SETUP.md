# Tracecase environment setup

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
| `TRACECASE_ORGANIZATION_ID` | Generated `org_…` value. |
| `TRACECASE_PROJECT_ID` | Generated `project_…` value. |
| `TRACECASE_PROJECT_NAME` | Your real product or repository name. |
| `TRACECASE_PROJECT_SLUG` | Lowercase letters, numbers, and hyphens. |
| `TRACECASE_TARGET_TEST_URL` | Staging or preview URL that workers may test. Do not use production yet. |
| `NEXT_PUBLIC_WIDGET_PROJECT_KEY` | Generated `pk_…` value. This is intentionally public. |
| `TRACECASE_WIDGET_ALLOWED_ORIGINS` | Exact websites allowed to embed the widget, comma-separated. |
| `WIDGET_SIGNING_SECRET` | New random 32-byte value. |
| `WORKER_SIGNING_SECRET` | New random 32-byte value. |
| `OTEL_INGEST_SECRET` | New random 32-byte value. Telemetry senders put it in `x-tracecase-ingest-secret`. |
| `RUN_MAX_MINUTES` | Keep `15` initially. |
| `MAX_PARALLEL_ENVIRONMENTS` | Keep `12` initially. Lower it if sandbox quota is smaller. |

Keep `TRACECASE_RUNTIME_MODE=live`, `TRACECASE_PERSISTENCE=mongodb`, and `ALLOW_EXTERNAL_CALLS=true`. `MONGODB_DATABASE` is the Atlas database name; keep `tracecase` unless you intentionally use another database. Keep `MONGODB_APPLY_CHANGES=false` in Vercel. `FIREWORKS_BASE_URL` and `DAYTONA_API_URL` are provider endpoints, not secrets.

For local UI inspection without GitHub credentials, start the development server with `TRACECASE_UI_PREVIEW=true npm run dev`. This bypass exists only when `NODE_ENV=development`; it cannot open dashboard routes in a production build.

## 2. MongoDB Atlas

1. Open [MongoDB Atlas](https://cloud.mongodb.com/) and create or select the hackathon project and cluster.
2. Create a database user with read/write access to the `tracecase` database.
3. Add the deployment’s network access. Atlas accepts connections only from its IP access list and requires a database user. For a short-lived hackathon deployment, an allow-from-anywhere entry plus a strong database-only password is the practical Vercel setup; replace it with restricted networking after the event. See [Atlas connection troubleshooting](https://www.mongodb.com/docs/atlas/troubleshoot-connection/) and [connection strings](https://www.mongodb.com/docs/manual/reference/connection-string/).
4. Select **Connect → Drivers → Node.js**. Copy the `mongodb+srv://…` URI, replace the password, and set `MONGODB_URI`.
5. Keep `MONGODB_DATABASE=tracecase`.
6. Locally, run:

   ```powershell
   npm run mongo:plan
   $env:MONGODB_APPLY_CHANGES='true'
   npm run mongo:apply
   $env:MONGODB_APPLY_CHANGES='false'
   npm run project:bootstrap
   ```

7. In Atlas **Search & Vector Search**, create the two automated-embedding indexes printed by `npm run mongo:plan`: `repo_knowledge_auto` on `repository_chunks.content` with `voyage-code-3`, and `operational_memory_auto` on `knowledge.content` with `voyage-4`. Atlas generates and maintains document and query embeddings; Tracecase does not need a separate embedding API key. See [MongoDB Automated Embedding](https://www.mongodb.com/docs/vector-search/crud-embeddings/automated-embedding/).

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

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\your-app.private-key.pem"))
```

Protect the private key and delete the local copy after storing the Base64 value securely. Tracecase exchanges its signed App JWT for short-lived installation tokens instead of using a personal access token. See [GitHub private keys](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/managing-private-keys-for-github-apps) and [installation tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app).

## 4. Fireworks

1. Open [Fireworks](https://app.fireworks.ai/).
2. Open your profile → **User Settings → API Keys → Create API Key**. Copy it once into `FIREWORKS_API_KEY`. See the [Fireworks onboarding guide](https://docs.fireworks.ai/getting-started/onboarding).
3. Keep `FIREWORKS_BASE_URL=https://api.fireworks.ai/inference/v1`.
4. Set `FIREWORKS_MODEL` to the exact model or deployment resource shown by Fireworks. Kimi K2.5 uses `accounts/fireworks/models/kimi-k2p5`, supports vision and function calling, and currently requires an on-demand deployment rather than serverless access. Use your Fireworks credits for that deployment, or select a model marked **Serverless** in the model library. See [Kimi K2.5 on Fireworks](https://fireworks.ai/models/fireworks/kimi-k2p5) and the [vision guide](https://docs.fireworks.ai/guides/querying-vision-language-models).

## 5. Daytona

1. Open the [Daytona dashboard](https://app.daytona.io/dashboard/keys).
2. Click **Create Key**, name it `tracecase-vercel`, set an expiry, and grant sandbox create/read/write/delete permissions.
3. Copy it into `DAYTONA_API_KEY`.
4. Keep `DAYTONA_API_URL=https://app.daytona.io/api` and set `DAYTONA_TARGET=us` or `eu`.

Daytona documents these exact environment names and API URL in its [API key guide](https://www.daytona.io/docs/api-keys).

## 6. Optional imports

Leave these blank unless the target company uses the provider.

For Sentry, open **Organization Settings → Developer Settings → Custom Integrations**, create an internal integration, and copy its token into `SENTRY_AUTH_TOKEN`. Grant only the read scopes needed for issues and events. `SENTRY_ORG` is the organization slug and `SENTRY_PROJECT` is the project slug shown in Sentry project settings, not the display name. See [Sentry authentication tokens](https://docs.sentry.io/api/guides/create-auth-token/).

For Jira Cloud:

- `JIRA_BASE_URL`: your site root, such as `https://your-company.atlassian.net`, with no trailing slash.
- `JIRA_EMAIL`: the Atlassian account email that owns the token.
- `JIRA_API_TOKEN`: create one in Atlassian account security and copy it once. See [Atlassian API tokens](https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/).
- `JIRA_PROJECT_KEY`: the short prefix before an issue number, for example `ENG` in `ENG-142`.

These are server-only. The core path does not require Sentry or Jira.

## 7. Add values to Vercel

1. Import the repository into Vercel.
2. Set **Root Directory** to `product`. Vercel detects Next.js automatically.
3. Add every required variable to **Production**, **Preview**, and **Development** as appropriate. Mark secrets as **Sensitive**.
4. Deploy once, then replace `NEXT_PUBLIC_APP_URL` with the final domain if it changed.
5. Update the GitHub callback, setup, and webhook URLs to that same domain.
6. Redeploy. Environment changes do not affect older deployments.
7. Run `npm run connections:check` locally with the Vercel development values to find missing entries.

`VERCEL_GIT_COMMIT_SHA` is supplied by Vercel automatically. Do not add it yourself. Tracecase records it with each run when Vercel provides it.

MCP configuration is intentionally absent. The repository MCP server does not exist yet, so placeholder MCP secrets would create a false connection. Add those variables only when its authenticated endpoint and permission model exist.
