# XSHOP Supabase foundation (Phase 2)

This repository has a Supabase Auth client/context, profile service/edit flow, the Phase 2 foundation migration, and local Auth redirect settings. `useAuth()` exposes `loading`, `authenticated`, and `unauthenticated` states; the Supabase client persists and refreshes browser sessions. **The owner reports that Phase 2 is already applied to the intended Supabase project. This workspace has no hosted project connection to verify that state; do not reapply Phase 2 as part of Prompt 3.** No project URL, publishable key, Google OAuth credentials, or SMTP credentials are available here, so hosted sign-up, email delivery, OAuth, and Storage access remain unverified.

## Browser configuration

1. Copy `client/.env.example` to `client/.env.local` (the root ignore rules keep local environment files out of Git).
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from the intended Supabase project. Both are public browser values. Never place a `service_role` key in a `VITE_` variable or client source.
3. Keep `VITE_CLERK_PUBLISHABLE_KEY` only if the legacy GenAxis AI routes are still being used; XSHOP customer routes do not read it.

When Supabase configuration is absent, public storefront routes still render. Authentication forms explain that sign-in is not configured, and protected customer routes send unauthenticated users to `/login`.

## Phase 2 migration reference (owner reports it is already applied)

The reference migration is `supabase/migrations/20260924000000_phase2_xshop_foundation.sql`. Do not reapply it for Prompt 3. It creates profiles, role helper/trigger functions, RLS policies, and Storage buckets/policies only; later store phases are additive migrations.

New `auth.users` records receive a `profiles` row with the database-selected `customer` role. User metadata can seed display name and avatar URL, but cannot set a role. Profile reads/updates are owner-scoped; authenticated users receive column-level update privileges only for `display_name`, `avatar_url`, and `phone`. The account settings UI updates only display name and phone; email remains managed by Supabase Auth. Email is synchronized from Supabase Auth. Role checks for later RLS policies use the non-API `private.user_has_any_role` security-definer helper. It evaluates the current JWT identity, and never accepts a target user ID from the browser.

The `/account/*` and `/checkout` React route guard is for navigation/UX only. Profile reads and writes are protected by RLS/column grants; any future order, checkout, or admin endpoint must independently enforce ownership and role checks in the database/server layer.

To grant a staff role later, use a trusted database operator after verifying the person and their Supabase Auth UUID. Do not add a frontend role editor or trust `user_metadata.role`. No elevated users are created by this migration.

## Authentication provider setup

- Email/password signup, sign-in, verification resend, password reset, and password update are implemented in the XSHOP UI through Supabase Auth. The local Supabase config enables email confirmations. Hosted projects must enable email confirmations in Auth settings and configure production SMTP; the hosted test-mail service is rate-limited and is not a production delivery guarantee.
- Configure these exact local redirect URLs in the hosted project's Auth URL allow list: `http://localhost:5173/auth/callback` and `http://localhost:5173/reset-password`. Add the exact production callback and password-reset URLs for the deployed storefront. The checked-in `supabase/config.toml` contains local-only defaults.
- Google OAuth is initiated with Supabase `signInWithOAuth`. Enable Google in the Supabase Auth provider settings and store the Google Client ID/Secret there, not in this repository or browser environment. Add the Supabase project's Auth callback URL (shown by Supabase; normally `https://<project-ref>.supabase.co/auth/v1/callback`) as an authorized redirect URI in Google Cloud. Add local and production storefront origins to Google's authorized JavaScript origins and add the XSHOP callback URL to Supabase's redirect allow list. No Google project credentials were supplied, so the provider is not enabled here.

See the [Supabase email/password guide](https://supabase.com/docs/guides/auth/passwords), [Google provider guide](https://supabase.com/docs/guides/auth/social-login/auth-google), [redirect URL guide](https://supabase.com/docs/guides/auth/redirect-urls), [RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security), and [Storage access-control guide](https://supabase.com/docs/guides/storage/security/access-control) for project-specific setup.

## Storage boundary

The migration declares:

- `product-media` — public bucket for approved, non-sensitive product imagery; public object URLs work, but anonymous metadata listing is not granted.
- `store-assets` — public bucket for non-sensitive storefront assets; writes are reserved for `admin`/`super_admin` roles.
- `avatars` — private bucket. Authenticated users can access only object paths under `<auth-user-uuid>/...`.

Do not place credentials, payment data, private files, or digital delivery codes in these buckets. Storage writes for product media and store assets have database-role checks; avatars are owner-folder scoped. Any future private fulfillment storage requires a separate design and must not reuse a public bucket.

## Clerk / existing backend migration boundary

Clerk remains intentionally isolated to the legacy GenAxis experiences:

- Client routes `/genaxis` and `/ai/*` are wrapped in `LegacyClerkBoundary`; they use the optional `VITE_CLERK_PUBLISHABLE_KEY`.
- Legacy AI pages still use Clerk hooks/plan checks. The Express `/api/ai/*` and `/api/user/*` routes still use Clerk middleware/auth and the existing `CLERK_SECRET_KEY`.
- `server/` also retains the Neon `DATABASE_URL`/creation records, Cloudinary, and AI provider integrations. These services are not used as XSHOP customer auth or store data services. Legacy browser calls use relative `/api/*` URLs; Vite dev and preview servers proxy those paths to the local Express server on port 3000, and a deployed ingress/reverse proxy must route `/api/*` to Express. No browser bundle should use a localhost API base URL.
- No Clerk accounts, Clerk IDs, Neon records, or creation records were migrated or deleted. A Clerk user ID is not assumed to equal a Supabase Auth UUID. The legacy backend should remain until the AI product is separately migrated or retired; it must not authorize XSHOP orders, profiles, or future fulfillment.

The only browser auth source for XSHOP is Supabase Auth. The Express/Neon/Clerk stack is a separate, legacy GenAxis boundary, not a second XSHOP auth system.
