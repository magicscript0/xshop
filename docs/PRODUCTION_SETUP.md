# XSHOP Production Setup (Vercel + Supabase)

## Live project state (checked 2026-09-25 with the publishable key, as `anon`)
| Check | Result |
|---|---|
| Publishable key valid / REST reachable | Yes |
| Migrations applied | Yes (`store_settings` Phase 8 rows present; `search_catalog` RPC works) |
| Products visible to anon (`products`, `search_catalog`) | **0** |
| Categories visible to anon | **0** |
| Email/password provider | Enabled, sign-ups allowed |
| Email confirmation (`mailer_autoconfirm`) | **Required** (autoconfirm = false) |
| Google provider | **Disabled** |

The empty storefront is a data issue, not a code/RLS bug: no migration seeds products.
A product appears only if `status='active'`, `visibility='public'`,
`resale_rights_verified=true` (with `resale_rights_verified_by/at`), and it has at least one
`product_prices` row. See `docs/CATALOG_SEED_AUDIT.md`.

## Vercel (Root Directory `client`, Framework Vite)
Settings → Environment Variables (Production **and** Preview), then **Redeploy**
(VITE_* values are inlined at build time):
```
VITE_SUPABASE_URL=https://yhfiiuoidwqoiezwczij.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```
Never add a service_role / secret key to any `VITE_` variable.

## Supabase Dashboard
1. Authentication → URL Configuration
   - Site URL: your production domain, e.g. `https://xshop-g3u8.vercel.app`
   - Redirect URLs: `https://xshop-g3u8.vercel.app/**`, `https://*-<team>.vercel.app/**` (previews), `http://localhost:5173/**`
2. Authentication → Sign In / Providers → Email: keep enabled. "Confirm email" is ON — users must click the link
   (lands on `/auth/callback`). The default mailer is rate-limited (a few emails/hour); configure custom SMTP for real traffic.
3. Google button: enable Authentication → Providers → Google, or users will see "Google sign-in is not enabled".
4. Catalog data: sign up, grant yourself `admin` in `public.user_roles` via SQL editor, then create categories/products/prices
   in `/admin` (or SQL) with the visibility requirements above.
