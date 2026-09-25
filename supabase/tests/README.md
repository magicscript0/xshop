# XSHOP database tests (local, no credentials)

Applies every migration in `supabase/migrations/` to an embedded Postgres
(PGlite) with minimal `auth` / `storage` shims, then exercises the real
business logic end to end:

- catalog visibility gate + Phase 9 filters/sorts (`provider`,
  `denomination`, `worldwide_only`, `featured`, `discount_desc`,
  `available_first`, `deal_ends_at`)
- persistent cart, order-wide + product/category-scoped coupons
- payment sessions (per-method minimum + expiry), hash submit, review notes,
  under-review flag, approve/reject, expiry release
- digital + manual fulfillment, single-delivery guarantees, outbox enrichment
- rewards earn/redeem, referrals guard, wishlist, notifications
- RLS: anon / customer / support / admin isolation, role management
- admin metrics, analytics, inventory, email-outbox RPCs

## Run

```bash
cd supabase/tests
npm install
npm test
```

A green run prints `ALL TESTS PASSED`. Any failure prints the failed
assertion and exits non-zero. Nothing touches a hosted project; the
database is in-memory and discarded after the run.

> Verified status (2026-09-25): **120/120 assertions pass** on PGlite /
> PostgreSQL 18.3 (`npm test` → `ALL TESTS PASSED`, exit 0). The suite
> caught and drove the fixes for five never-executable statements in the
> Phase 4/6 migrations — see `docs/SUPABASE_PHASE9.md` §2.

> These tests validate migration SQL and database behavior only. They do
> not apply anything to Supabase — see `docs/SUPABASE_PHASE9.md` for the
> hosted apply procedure.
