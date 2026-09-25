# XSHOP Supabase Phase 9: marketplace gaps

Date: 2026-09-25 · Branch: `arena/01a0d614-xshop` · Migration: `supabase/migrations/20260925000000_phase9_marketplace_gaps.sql`

**Status: written and locally verified (120/120 assertions green on PGlite/PostgreSQL 18.3). NOT applied to any hosted project from this workspace — no Supabase credentials are available here.** The owner (or a connected session) must apply it following §4 below.

## 1. What Phase 9 adds

All changes are additive; no table/column is renamed or dropped.

| Area | Change |
|---|---|
| Merchandising | `products.provider_name`, `featured`, `terms`, `redemption_instructions`, `region_restrictions`, `delivery_method`, `delivery_eta`, `low_stock_threshold`; `product_prices.deal_ends_at` |
| Payment config | `payment_methods.instructions`, `min_order_amount`, `expires_after_minutes` (default 60), `display_order`; `create_payment_session` honors per-method expiry/minimum with server-clock `expires_at` |
| Payment review | `payment_sessions.review_state` (`none`/`under_review`), `payment_review_notes` (admin-only), `admin_add_payment_note`, `admin_set_payment_review_state` (live sessions only), new `payment_events` types `note_added` / `review_state_changed` |
| Orders | `orders.order_number` (`XS-XXXXXXXX`, unique, auto-issued; backfilled for old rows) |
| Coupons | `coupon_products` + `coupon_categories` scope tables; `evaluate_coupon`/`preview_coupon`/`create_order_from_cart` discount only matching lines, reject non-matching carts; scope visible to admins only |
| Catalog | `catalog_current_offers` gains `provider_name`, `worldwide`, `featured`, `denomination_value`, `deal_ends_at`, `max_discount_ratio`, `is_available`; `search_catalog` gains `provider_filter`, `denomination_min/max`, `worldwide_only`, `featured_only`, `deal_ends_at` in price options, `discount_desc` / `available_first` sorts |
| Email | `email_templates` table (seeded `order_fulfilled` template), outbox payload enrichment trigger (adds `order_number`, `items`, `order_url_path`, `total_amount`, `currency_code`), `admin_list_email_outbox` RPC |
| Settings | Public-readable `legal.*` + `store.support_*` settings, seeded empty (owner must fill; see §6) |
| Admin RPCs | `admin_dashboard_metrics` gains `reviews.pending` + `outbox.pending_email` (NULL-safe when Phase 8 tables exist) |

## 2. Corrections to earlier migrations (required reading)

Local execution proved that three earlier files contained statements that **could never run**. They were fixed in place; each fix is marked with a `CORRECTION (2026-09-25)` comment at the top of its file. In-place editing is safe here because a statement that always errors cannot have produced working behavior that depends on it.

| File | Defect | Proof it never worked | Fix |
|---|---|---|---|
| Phase 4 `..._phase4_customer_experience.sql` | `cart_add_item` used bare `ON CONFLICT DO UPDATE` | PostgreSQL requires a conflict target for `DO UPDATE`; every add-to-cart call errored (`42601`) | Arbiter matching the `cart_items_one_option_per_cart` unique index |
| Phase 6 `..._phase6_digital_fulfillment.sql` | Called `jsonb_object_length()` (4 sites) | **The function does not exist in PostgreSQL** — verified on PG 18.3 | Equivalent `= '{}'::jsonb` / `<> '{}'::jsonb` comparisons |
| Phase 6 | Truncated duplicate tail after `commit;` (`.verify_payment_session...` + repeated triggers) | `syntax error at or near "."` | Removed the 6 trailing garbage lines |
| Phase 6 | Bare `CASE` inside an `IF` condition in `fulfillment_manual_complete` | **PostgreSQL 18's plpgsql rejects bare `CASE` in `IF`/`ELSIF` conditions** (`syntax error at end of input`; verified minimal repro; `WHILE`/`RETURN`/SQL contexts unaffected) | Wrapped `CASE…END` in parentheses (works on all PG versions) |
| Phase 6 | `fulfillment_id` / `delivery_index` plpgsql variables collide with `fulfillment_items` columns | Every delivery insert failed with `column reference … is ambiguous`, routing all approvals to `failed` | Renamed to `fulfillment_key` / `delivery_position` (column lists untouched) |

## 3. What this implies about the hosted project

- **Phase 6 provably never applied anywhere**: the file is one transaction and its first errors abort everything; no database can contain any Phase 6 object from these files.
- **Phase 7 almost certainly never applied**: it references Phase 6 tables (`digital_inventory_batches`, …) and would fail without them.
- **Phase 8 status is unknown**: verify on hosted (§5). Phase 8 does not hard-depend on Phase 6 objects, so it may have applied.
- **Phase 4 `cart_add_item` is broken wherever Phase 4 applied** (any add-to-cart errors at runtime). The §2 fix repairs it.

## 4. Hosted apply procedure (owner session)

Prerequisites: a Supabase session with the project open (SQL editor) or `supabase` CLI linked. **Do not paste service keys into chat or files.**

1. **Inspect current state** with the §5 queries (decide whether Phase 8 is already applied).
2. **Re-apply the corrected Phase 4 function only** — run just the `create or replace function public.cart_add_item…` statement from the corrected Phase 4 file (the rest of Phase 4 is already applied; re-running whole files uses bare `create table` and would conflict).
3. **Apply the corrected Phase 6 file** end to end in one execution (it is wrapped in `begin;`/`commit;`).
4. **Apply Phase 7**, then **Phase 8** (skip if §5 shows it applied), then **Phase 9** — each end to end, in order.
5. **Re-run §5** to confirm, then continue with the owner-only setup in §6.

If any file errors partway, its transaction rolls back — fix forward from the error message; do not hand-create individual objects.

## 5. Hosted verification queries (read-only)

```sql
-- Phase 6 present?
select to_regclass('public.fulfillments') as fulfillments,
       to_regclass('public.digital_inventory') as digital_inventory;
-- Phase 7 present?
select to_regclass('public.admin_audit_log') as audit_log;
-- Phase 8 present?
select to_regclass('public.coupons') as coupons,
       to_regclass('public.reward_ledgers') as reward_ledgers;
-- Phase 9 present?
select to_regclass('public.coupon_products') as coupon_products,
       to_regclass('public.email_templates') as email_templates,
       to_regclass('public.payment_review_notes') as review_notes;
-- Key RPCs present?
select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('verify_payment_session','fulfillment_manual_complete',
    'admin_dashboard_metrics','admin_list_email_outbox','admin_add_payment_note',
    'admin_set_payment_review_state','preview_coupon','expire_my_payment_sessions')
order by 1;
-- Smoke: public catalog callable (empty until real products are added)
select count(*) from public.search_catalog(null, null, null, null, null, null, null, null, null, null, 'relevant', 5, 0);
```

## 6. Owner-only follow-ups (unchanged, still pending)

These cannot be done from this workspace: promote the first admin/super-admin via SQL (`update public.profiles set role = 'super_admin' …`); insert the starter `payment_methods` rows with real receiving addresses (USDT-TRC20 / BTC / TRX — **no wallet material in Git**); fill `legal.*` / `store.support_*` settings; provision the outbox email worker + SMTP (see email runbook in the next phase); enable scheduled expiry (`private.expire_stale_payment_sessions`) via pg_cron or the worker; add only legitimate, resale-authorized products.

## 7. Local verification

`supabase/tests/run.mjs` (PGlite, no credentials) applies all 8 migrations in order with minimal `auth`/`storage` shims, then runs 120 assertions across catalog, cart/coupons, payment lifecycle, fulfillment/outbox, rewards, RLS, and admin RPCs:

```bash
cd supabase/tests && npm install && npm test   # → ALL TESTS PASSED
```

Known environment note: the harness runs PostgreSQL 18.3 while hosted Supabase projects typically run older majors. The one version-sensitive construct found (bare `CASE` in `IF` conditions, §2) is fixed in the parenthesized form, which is valid on every supported version.
