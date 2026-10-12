# Lovebug Booth v0.5.4 — Daily Health & Keep-Alive

The Lovebug Booth photo booth is **local-first**. This infrastructure feature does **not** upload pictures, stickers, user details, camera feeds, or invite links. It only creates dated health records for this Supabase project.

**Two independent schedulers** call the same Supabase Edge Function:

- GitHub Actions makes one authenticated **POST** daily, using a repository secret. It writes a heartbeat.
- Your external cron scheduler should make an authenticated **POST** daily using its separate token. It also writes a heartbeat.
- Either scheduler may call **GET** to check website reachability and **read** its most recent heartbeat, without inserting or updating any database row.

Both HTTP methods probe the Vercel homepage with a short HEAD request. GET reads the latest database row (or returns `null` if none exists); POST upserts one private record per source per UTC day. A successful `200` means the website responded and the chosen database operation succeeded. A `503` means either website or database health failed. It does **not** prove live video, photo editing, auth, or in-browser storage works.

**Supabase may still pause Free projects.** Its documented activity rules do not guarantee scheduled pings will always prevent pausing. GitHub may delay/drop schedule events and disables scheduled workflows in inactive public repositories after 60 days. Your independently scheduled cron is useful redundancy.

## 1. Apply the patch and secure the database

Apply the Git AM patch on top of v0.5.3 in a clean working tree. Before deploying the endpoint, open [Supabase SQL Editor](https://supabase.com/dashboard/project/cwmsqihdtxsfgmslavpk/sql) and run the **complete** file:

`supabase/migrations/20261013_003_daily_health.sql`

This migration:

- Enables RLS on the existing `public.keep_alive_log` table.
- Revokes table access from `anon` and `authenticated`. There are deliberately **no public RLS policies**.
- Leaves existing rows intact; adds UTC day and website-check fields.
- Adds a unique index on `(source, heartbeat_day)` so retries update the day's record, not create endless duplicates.
- Allows the Supabase server role to write from the protected Edge Function only.

The table had zero rows when we inspected it. If you've independently added repeated rows for the same source/date, the unique-index creation can fail; review those rows before migrating. Do not delete historical data just to force the migration through.

Verify using this read-only SQL in the SQL Editor:

```sql
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public' and tablename = 'keep_alive_log';
```

`rowsecurity` should be `true`.

## 2. Generate two different long random tokens

In **PowerShell**, run this command **twice**, copying each result somewhere private:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

They will each have 64 hexadecimal characters. Assign them:

- `LOVEBUG_HEALTH_CRON_TOKEN` — for your third-party cron service.
- `LOVEBUG_HEALTH_GITHUB_TOKEN` — for GitHub Actions.

Do not reuse a Supabase publishable, `service_role`, or `sb_secret_...` key as either token. Never commit a token, paste it in a public issue, or put it into a `VITE_...` variable.

Go to [Supabase Edge Function Secrets](https://supabase.com/dashboard/project/cwmsqihdtxsfgmslavpk/functions/secrets), and create those **two** secrets with their corresponding values. The Edge Function reads them server-side. It uses Supabase's built-in service credential only within the function; you do not expose that credential to the schedulers.

## 3. Deploy the Edge Function

From your `lovebug-booth` folder:

```powershell
npx supabase@latest login
npx supabase@latest functions deploy lovebug-health --project-ref cwmsqihdtxsfgmslavpk --no-verify-jwt
```

The included `supabase/config.toml` also sets `verify_jwt = false` specifically for this function. This is **required for third-party webhook-style requests**; the handler itself always checks a long secret before touching the database. Without the correct secret it returns HTTP 401; if secrets are missing it returns HTTP 503.

If the CLI needs to link the project first, use:

```powershell
npx supabase@latest link --project-ref cwmsqihdtxsfgmslavpk
```

**Do not** turn off JWT verification on other Edge Functions. After deployment, [Supabase Edge Functions](https://supabase.com/dashboard/project/cwmsqihdtxsfgmslavpk/functions) should list `lovebug-health` with JWT verification disabled. The function must have its own tokens configured in step 2.

## 4. Add the URL to your existing cron service

The function's **base URL** is:

```text
https://cwmsqihdtxsfgmslavpk.supabase.co/functions/v1/lovebug-health
```

### Option A — Preferred: if your scheduler supports an HTTP header

- **URL:** `https://cwmsqihdtxsfgmslavpk.supabase.co/functions/v1/lovebug-health?source=cron`
- **Method:** `POST` **to write a daily heartbeat** (no request body required).
- **Custom header:** `x-lovebug-health-token`
- **Header value:** your `LOVEBUG_HEALTH_CRON_TOKEN`
- **Schedule:** once per day, at a different hour from GitHub Actions (the action uses 07:47 Sri Lanka time).
- **Expected status:** HTTP 200; a failure should notify you.

### Option B — URL-only cron service

Choose **POST** and paste this URL, **replacing the placeholder locally**:

```text
https://cwmsqihdtxsfgmslavpk.supabase.co/functions/v1/lovebug-health?source=cron&token=YOUR_64_CHARACTER_CRON_TOKEN
```

If the scheduler allows **GET only**, the same URL works as a read-only health check, but **no new row will be recorded**. Your separate GitHub Actions POST will still record its daily heartbeat. A database SELECT is activity, but free-tier pausing prevention is never guaranteed.

**Treat the entire filled-in URL as a secret.** The token may be stored in third-party scheduler settings, browser history, or request access logs. Keep the scheduler job private, don't share its URL, and rotate the dedicated cron token if it leaks. Never put a Supabase admin key in a URL.

### Quick manual tests on Windows

After deployment, test **POST writes** and **GET reads** without putting the token into your shell history:

```powershell
$token = Read-Host "Cron heartbeat token"
$uri = 'https://cwmsqihdtxsfgmslavpk.supabase.co/functions/v1/lovebug-health?source=cron'
$headers = @{ 'x-lovebug-health-token' = $token }
Invoke-RestMethod -Method Post -Uri $uri -Headers $headers
Invoke-RestMethod -Method Get -Uri $uri -Headers $headers
Remove-Variable token,headers
```

POST should return `method: "POST"`, `stored: true`; GET should return `method: "GET"`, `stored: false`, and `latest_heartbeat` containing the POST record. Both check the current Vercel website response.

## 5. Add the GitHub Actions secret

The patch includes `.github/workflows/daily-health.yml`, which runs at **02:17 UTC daily** (07:47 in Sri Lanka) and allows a manual **Run workflow** action.

Open [GitHub → lovebug-booth → Actions secrets](https://github.com/Shadhujan/lovebug-booth/settings/secrets/actions):

1. Select **New repository secret**.
2. **Name:** `LOVEBUG_HEALTH_GITHUB_TOKEN`.
3. **Secret:** paste the separate GitHub token from step 2 (same value as the Supabase Edge Function secret with that name).
4. Save. Push your patch if you haven't already.
5. Open [Actions](https://github.com/Shadhujan/lovebug-booth/actions), choose **Lovebug Booth - Daily Health**, then **Run workflow** once to confirm it succeeds.

The Action sends a **POST** to `?source=github-actions` with its token in a private header. It never puts the token into the URL or logs.

**Warning:** GitHub may disable scheduled workflows after 60 days of repository inactivity on a public repo. Keep an eye on Actions and use the independent cron as redundancy. The two schedulers use different tokens and rows, so either can be rotated without affecting the other.

## 6. Verify the records

In Supabase SQL Editor, run:

```sql
select id, source, heartbeat_day, pinged_at,
       website_ok, website_http_status, website_latency_ms
from public.keep_alive_log
order by pinged_at desc
limit 20;
```

There should be up to **two rows per UTC day**: `cron` and `github-actions`. Running **POST** repeatedly for the same source on one day updates its record; **GET never creates or changes a row**.

Try the endpoint **without any token**. It should return 401 and must **not** add a database row. A valid token can still return HTTP 503 if Vercel is unavailable; in that case a record with `website_ok = false` should be present.

## 7. Security and upkeep

- Edge Function verifies the source-specific token; no browser credentials are accepted as heartbeat credentials.
- RLS is enabled, and the heartbeat table is inaccessible to `anon` / `authenticated` clients. Keep `SUPABASE_SECRET_KEYS` and `SUPABASE_SERVICE_ROLE_KEY` server-side only.
- No photos, identifiers of booth users, invites, or camera frames are collected.
- Rotation: replace one token in Supabase Secrets and its corresponding GitHub secret or cron configuration, then retest.
- POST requests are idempotent per source/day. GET performs an authenticated read only. This is **not** a general public write API.
- GitHub and external cron success proves the health endpoint and database are responding. A Supabase pause or broader regional outage may still require manual intervention.
- If you later change the Vercel domain, update `SITE_URL` in the Edge Function and redeploy.

References: [Supabase Edge Function auth](https://supabase.com/docs/guides/functions/auth), [Supabase Edge Function secrets](https://supabase.com/docs/guides/functions/secrets), [Supabase Free project pausing](https://supabase.com/docs/guides/platform/free-project-pausing), [GitHub scheduled workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows).

## 8. VS Code: Deno errors and local Supabase CLI files

The web app runs under Node.js/Vite, but `supabase/functions/lovebug-health/index.ts` runs under Deno. The built-in TypeScript server does not resolve `npm:` imports or the `Deno` namespace on its own. These IDE errors do not mean the deployed function is broken.

1. Install the official **Deno** VS Code extension (`denoland.vscode-deno`). Install the Deno CLI separately if the extension asks for it; check `deno --version`.
2. Put the following in your **local** `.vscode/settings.json` at the repo root (merge with existing settings instead of overwriting):

   ```json
   {
     "deno.enablePaths": ["./supabase/functions"]
   }
   ```

3. Run **Developer: Reload Window** in VS Code. Deno should handle Edge Function files, and TypeScript should keep handling `src` and Vite.
4. The Supabase CLI creates `supabase/.temp/cli-latest` and `linked-project.json`. They are now ignored via `.gitignore`; **do not commit or push them**.

If the extension still shows errors, open its output panel (`Deno Language Server`) and confirm `deno --version` is available. Supabase's current guide is [Development Environment](https://supabase.com/docs/guides/functions/development-environment).
