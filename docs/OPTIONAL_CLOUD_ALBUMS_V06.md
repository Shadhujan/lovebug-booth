# Lovebug Booth v0.6 — optional accounts and private cloud albums

> This replaces the hidden **single-couple** cloud prototype from v0.4. It does not change Quick Rooms, Locked Rooms, WebRTC, sticker editing, local memories, or daily health jobs. Nothing is uploaded unless the person taps a cloud-save button.

## What is included

- **No sign-in** for the normal booth, camera, Photo Letters, Together Apart, editing, or device album.
- An opt-in switch on **Our little album**: **On this device** (default) or **Private cloud**.
- **Continue with Google** in the cloud panel only. The normal app does not prompt users to sign in.
- **My private photos**: signed-in user can upload chosen local photo strips, list, download, and delete their own uploads.
- **Shared with someone**: any signed-in person can create their own two-person shared album, copy a one-time code to another person, or join using a code. Each album is isolated from every other album.
- The invitation code is a cryptographically random 256-bit value; only its SHA-256 hash is stored in Supabase. It expires after **7 days** and is consumed on joining. A room creator can generate a fresh code before a second member joins.
- Photos are stored in a **private** Storage bucket; private images are downloaded with the authorized user's Supabase session. No public image URLs.
- Auth **anonymous users** (which are used by secure Quick/Locked Rooms) have the `authenticated` database role but cannot read or write cloud albums because every policy checks `is_anonymous = false`.

## 1. Apply the Git AM patch and build

Use the v0.5.4.1 baseline and a clean working tree:

```powershell
cd D:\Projects\lovebug-booth
git status --short
git am "$env:USERPROFILE\Downloads\Lovebug_Booth_v0.6_Optional_Google_and_Private_Cloud_Albums_git-am.patch"
npm run typecheck
npm run build
```

The patch makes **no live Supabase or GitHub changes** by itself. Keep the migration and application deployment as separate, verified manual steps.

## 2. Supabase SQL migration (required; run once)

Open [the project's Supabase SQL Editor](https://supabase.com/dashboard/project/cwmsqihdtxsfgmslavpk/sql), then run the complete file:

`supabase/migrations/20261013_004_cloud_albums_v6.sql`

This migration:

1. Revokes old v0.4 single-couple RPC and table access; drops **old** Storage policies. It keeps the legacy tables, rows and files for later manual recovery. Do **not** delete the `lovebug-private` bucket.
2. Creates `lovebug_v6_couples`, `lovebug_v6_members`, `lovebug_v6_invites`, and `lovebug_v6_photos`.
3. Enables RLS, including explicit permanent-user checking. `lovebug_v6_invites` is never readable directly by browser roles.
4. Creates a **new**, nonpublic bucket called `lovebug-v6-private` for 10 MB PNG files, with upload, download and delete policies.
5. Adds three authorized pairing RPCs. Membership inserts cannot be performed directly with the browser key.

Run this read-only check after SQL succeeds:

```sql
select schemaname, tablename, rowsecurity from pg_tables
where schemaname='public' and tablename like 'lovebug_v6_%'
order by tablename;

select id,public,file_size_limit from storage.buckets
where id in ('lovebug-private','lovebug-v6-private');
```

Expected: RLS enabled for all v6 public tables; new bucket is `public = false`. No data from the old cloud prototype are moved automatically.

## 3. Google sign-in configuration

Your project already has a Google OAuth Client ID/Secret and redirect URLs configured from v0.4. Verify rather than recreating them:

- [Supabase Auth providers](https://supabase.com/dashboard/project/cwmsqihdtxsfgmslavpk/auth/providers) → Google enabled.
- [Supabase URL configuration](https://supabase.com/dashboard/project/cwmsqihdtxsfgmslavpk/auth/url-configuration): `https://lovebug-booth.vercel.app`, `https://lovebug-booth.vercel.app/**` and `http://localhost:5173/**`.
- [Google Auth Platform](https://console.cloud.google.com/auth/audience): if OAuth consent is in Testing, add both of your Google accounts as test users.
- Google Cloud OAuth Web Client must have `https://cwmsqihdtxsfgmslavpk.supabase.co/auth/v1/callback` under **Authorized redirect URIs**.

Use **only** your existing public `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` on Vercel. No secret keys, Google client secrets, or invitation codes in the Vite client, GitHub, chat, or query strings.

## 4. Enable cloud on a test build, not automatically for all public visitors

Cloud features are **off by default**. This protects the existing production app if the migration has not yet run or the privacy checks have not passed.

In your local `.env.local`, set:

```dotenv
VITE_LOVEBUG_CLOUD_ENABLED=true
```

Restart `npm run dev` to see the **Private cloud** tab. In Vercel, you can enable this environment variable for a **Preview** deployment for testing. Add that **exact Preview deployment URL** (including `/**`) to Supabase Auth Redirect URLs before testing its Google callback; do not allowlist all of `*.vercel.app`. Leave **Production** unset/false until two-account and third-account security checks pass. `VITE_` flags are public configuration, not secrets. After testing, setting the flag to `true` in Production and redeploying exposes the optional feature.

## 5. First run (test with two accounts before public rollout)

1. On your regular browser, take a photo, decorate it, and choose **Keep on this device**. Open **Our little album**; it defaults to **On this device**.
2. Select **Private cloud** → **Continue with Google**. Sign in. Verify the browser returns to the cloud view after OAuth (with `?album=1`).
3. Select **My private photos** → upload **one** local strip. Confirm it appears in the online gallery. Local photos must remain intact. Sign in on a second browser/device with the **same** Google account and confirm the online photo can be downloaded.
4. Switch to **Shared with someone** → **Create album & invite**. Copy the code privately to your partner (not in the URL).
5. Partner signs in with their **own** Google account, opens the cloud tab, pastes the code, and joins. Both accounts can now upload photos into that specific shared album. Refresh to see one another's additions.
6. In each browser, delete only your own uploaded cloud photo. Your partner's photo and the local copy must remain.
7. Use a third signed-in Google account. It must **not** see or download either person's private photos or shared album; the already-used invitation code must fail.
8. Open a Quick Room **without signing in with Google** in a fresh incognito browser; rooms must still work. An anonymous room identity must have no cloud gallery access.
9. Test a network disconnect during shared editing; the person remaining connected must be able to finish locally, as in prior versions.

### Negative security checks (important before public release)

- A browser with only a publishable key or an anonymous room JWT cannot SELECT `lovebug_v6_photos`, list accessible couples, download `lovebug-v6-private` files, or execute successful pairing RPCs.
- User A cannot see user B's **personal** photos; user C cannot see any shared photos from A+B.
- User A cannot delete user B's shared photo or upload into a couple of which A is not a member.
- A third account cannot join an album with two members, including when requests occur concurrently.
- Storage bucket stays private and grants no public signed URLs. A direct Storage public object URL must not show a photo.
- A local strip never uploads merely by opening an album, taking a picture, or creating a room.

**Do not announce public cloud saving** until these checks pass on the deployed application.

## Known v0.6 limitations

- Existing v0.4 cloud photos are preserved but not migrated into v0.6. The old prototype is intentionally disabled at the database layer.
- A creator can have up to five shared albums; each supports up to two users. Invitation codes can be renewed while one seat remains.
- The gallery shows the latest 24 cloud photos per selected category. Pagination, album leaving/deletion, and account deletion are future work.
- Free-tier Storage can fill up if cloud uploads become popular. Add enforceable user storage quotas, abuse protection and account/data deletion workflows **before opening cloud storage to the public**.
- A custom local sticker itself is not uploaded; the **finished flattened PNG** is uploaded when chosen.
- Google OAuth may replace a temporary anonymous session; only start cloud sign-in from the album when not actively in a live room.
- No migration, Firebase, Google Cloud, or Supabase configuration is modified automatically when the patch is applied.

Keep the cron/GitHub daily health monitoring separate; v0.6 does not change it.
