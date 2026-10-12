# Lovebug Booth v0.4 — Our Private Little World ♡

> **Paused in v0.4.1:** This is a prototype for a single couple, not a safe public multi-user album. The cloud album UI is hidden for the guest-first release. Do not run this migration for a public deployment or invite unrelated users. Enabling optional accounts later requires redesigning the schema for independently isolated user/couple albums. If you already ran this migration or uploaded photos, disabling the UI does not delete the existing cloud records or files.

This milestone adds a two-person shared photo album without changing the working booth or forcing sign-in for local features.

## What it does

- You can still use solo photos, Photo Letters, Sticker Playground and browser-local albums without an account.
- The **Our little album** page now has a separate, opt-in **Our shared memories** section.
- Each partner signs in with their own Supabase Auth account (Google sign-in recommended).
- Both users enter **one private 64-character invitation code once**. A database lock enforces a maximum of two members.
- Only members can list and download photo-strip PNGs; only the uploading member can delete their cloud photo.
- A local strip is uploaded **only when you explicitly tap “share this strip”**. Other browser-local photos stay on the device.
- The private Storage bucket has no public object URLs and the browser only uses the Supabase publishable key.

**Important:** This release protects the shared album, **not** Live Together rooms. Live camera rooms still use unlisted public-channel invite links until the next private Realtime milestone. Keep live links private.

## Step 1 — SQL migration (required before signing in)

1. Open your Supabase project → **SQL Editor** → New query.
2. Copy and run the complete contents of `supabase/migrations/20261012_001_lovebug_private_album.sql`.
3. Verify **Database → Tables** includes `lovebug_spaces`, `lovebug_members` and `lovebug_strips` and **Storage → Buckets** contains `lovebug-private` marked **Private**.
4. Run the **one-time bootstrap query** below in the SQL Editor. It generates a cryptographically random invitation code and stores *only its SHA-256 hash* in the database. Copy the resulting `invite_code` immediately into a private password manager. Share it with your girlfriend through a private channel. **Do not commit it, paste it into ChatGPT or put it into `.env`.**

```sql
-- Run exactly ONCE, after running the migration above.
with seed as (
  select replace(gen_random_uuid()::text, '-', '') ||
         replace(gen_random_uuid()::text, '-', '') as invite_code
), new_space as (
  insert into public.lovebug_spaces(invitation_hash)
  select encode(sha256(convert_to(invite_code, 'UTF8')), 'hex') from seed
  returning id
)
select new_space.id as private_space_id, seed.invite_code
from new_space cross join seed;
```

The table permits only one shared space. If a space already exists, **do not rerun** the bootstrap: reuse the code you saved earlier. If the code is lost, an administrator can rotate the hash in SQL Editor by generating and saving a new code; existing members retain access. Keep the new code private.

## Step 2 — Configure Supabase sign-in

**Recommended free path: Google sign-in (no auth emails needed).**

1. In Google Cloud Console, create or choose a free project and configure **Google Auth Platform / OAuth consent**.
2. If your Google OAuth app is in testing mode, list **both Google accounts** as test users.
3. Create a Web application OAuth Client ID/Secret. In Google Cloud, add the Supabase callback `https://YOUR_PROJECT_ID.supabase.co/auth/v1/callback` as an **Authorized redirect URI** (replace the placeholder with your exact Supabase project reference).
4. In Supabase → **Authentication → Providers → Google**, enable Google and paste the client ID and client secret **in the Supabase dashboard only**.
5. In Supabase → **Authentication → URL Configuration**, set **Site URL** to `https://lovebug-booth.vercel.app` and add redirect URLs:
   - `https://lovebug-booth.vercel.app/**`
   - `http://localhost:5173/**` (for local development)
6. Verify both accounts can use **Continue with Google** on the deployed website.

**Email magic-link alternative:** Supabase's default email provider only sends to pre-authorized project-team addresses and is heavily rate-limited. To use magic links with arbitrary email addresses (including your girlfriend's), configure a custom SMTP provider in Supabase. Don't assume email works for both users before testing it.

## Step 3 — Keep your keys safe

No new frontend environment variables are required. Existing values remain:

```
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

These are public browser values. **Never add Supabase secret/service-role keys or your invitation code** to frontend variables, GitHub, or chat messages.

## Step 4 — First-time pairing

1. Open **Our little album** on your phone.
2. Tap **Continue with Google**, sign in, then enter your shared invite code **once**.
3. Your girlfriend opens the site on her phone, signs into her *own* Google account and enters the **same code**.
4. Once two accounts are paired, a third account cannot join, even if it learns the code.
5. On either phone, take a strip, decorate it and save to the local album.
6. In the shared-album section, select the local strip and tap **share this strip**. Both phones can refresh to see the new memory.

Local and cloud saving are separate: saving from the Finish screen still saves **only in the current browser**, and it doesn't auto-upload.

## Step 5 — Privacy and negative checks

- In an incognito browser **not signed in**, local booth works but the cloud album requires sign-in.
- Sign in as a third user who did **not** join via the code. They must not see, list, upload, or download the couple's cloud photos.
- After both members join, a third signed-in user trying the correct invitation code must be rejected as full.
- Confirm `lovebug-private` is **not public** in the Storage dashboard.
- Both members must see each other's shared photos and be able to download them.
- One member must **not** be able to delete a photo uploaded by the other.
- Uploaded files should be stored as `{space_uuid}/{photo_uuid}.png`; metadata belongs to the same space.
- Remove your own cloud photo: it should vanish for both members. Deleting a local copy should not delete the shared copy, and vice versa.
- Test a photo over 10 MB: sharing must reject it.

**RLS cannot be fully security-tested from source code alone**. Use the two real accounts plus a separate unauthorised account to verify restrictions in your actual Supabase project before you treat the album as private.

## Troubleshooting

- **`Could not check your couple membership`**: Run the SQL migration; verify it completed without errors.
- **`This little space is already full`**: Two users are already paired. Check `lovebug_members` from Supabase SQL Editor; only a trusted administrator should revoke memberships.
- **`Email address not authorized`**: Prefer Google sign-in, or configure custom SMTP.
- **OAuth callback rejected**: Check Supabase URL Configuration and Google's callback URI. They are *different* URLs.
- **Bucket error or broken photo**: Check the private `lovebug-private` bucket and `storage.objects` RLS policies.
- **Uploads work locally but not on Vercel**: Verify you deployed the latest commit and configured the two existing `VITE_` values in Vercel Production.

## Recovery and limitations

- Both users are required to explicitly sign in; sessions persist only in their own browsers.
- The server-side membership is permanent until an administrator changes it in Supabase. There is **no invite-management admin screen** yet.
- You should keep downloaded backups of precious memories. Supabase Free doesn't provide downloadable database backups, and paused projects or exceeded limits can affect access.
- This implementation does not change or secure the existing unlisted WebRTC room signaling. **Private, membership-gated Realtime rooms are the next milestone.**
