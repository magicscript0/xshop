# XSHOP — Supabase Phases 7–10 (Admin Operations & Growth)

Two additive migrations complete the XSHOP database. They build on Phases 2–6 and
**must be applied after** all earlier migrations, in this order:

1. `supabase/migrations/20260924001000_phase7_admin_operations.sql`
2. `supabase/migrations/20260924001100_phase8_growth.sql`

Earlier migrations are never rewritten — these files only add objects or
recreate functions/policies with `CREATE OR REPLACE` / explicit `DROP FUNCTION`
where a signature changed.

## How to apply

With the Supabase CLI linked to your project:

```bash
supabase db push
```

Or open the Supabase Dashboard → SQL Editor and run the two files above in
order. Each file is transactional; if a statement fails, nothing in that file
is applied.

> These migrations were **not** applied to a live database from this
> environment (no project credentials are available here). Apply them manually
> before using the admin dashboard, coupons, rewards, or referrals.

## What migration 001000 (Phase 7) adds

- **Staff read access** — `support`, `admin`, and `super_admin` can read
  orders, order items, and customer profiles for support work; only
  `admin`/`super_admin` can act on payments, catalog, and inventory.
- **`store_settings`** — database-driven configuration with seeded keys:
  `inventory.low_stock_threshold`, `rewards.*`, `referrals.*`. Public rows
  (`is_public = true`) are readable by everyone; everything else is admin-only.
- **`admin_audit_log`** + `private.audit_row_change()` triggers — every
  privileged write to catalog tables, payment methods, and settings records
  actor, action, entity, timestamp, and previous/new state. Digital inventory
  payloads are **never** written to the log.
- **`admin_set_user_role(uuid, text)`** — `super_admin` only; cannot change
  your own role.
- **`admin_inventory_summary()` / `admin_void_inventory_item(uuid, text)`** —
  stock overview with the configured low-stock threshold, and audited voiding
  of individual inventory items (never exposes code payloads).
- **`private.consume_rate_limit(...)`** — database-side rate limiting applied
  via triggers to order creation, payment sessions, transaction-hash
  submissions, cart writes, and inventory imports.

## What migration 001100 (Phase 8) adds

- **Coupons** — `coupons` + `coupon_redemptions`. All validation (status,
  window, minimum order, usage limits, per-customer limits, currency) happens
  in the database. Totals can never go negative; redemptions are confirmed on
  verified payment and released on rejection/expiry.
- **Loyalty rewards** — `reward_transactions` is an append-only immutable
  ledger. Points are earned only on **verified** orders, refunded on
  rejection, and adjustable by admins through the audited
  `admin_adjust_reward_points(...)` function (balance can never go negative).
- **Referrals** — `referral_codes` + `referral_attributions`.
  `apply_referral_code(text)` rejects self-referral and anyone with existing
  verified orders; the referrer is rewarded only after the referred customer's
  order is **verified** and meets the configured minimum.
- **Order discounts** — `orders` gains coupon and reward columns, and
  `create_order_from_cart` now accepts `_coupon_code` and `_redeem_points`. A
  database CHECK guarantees `total = subtotal − discounts ≥ 0`.
- **Notifications** — triggers insert customer notifications for order
  creation, payment status changes, and fulfillment updates.
- **Analytics** — `admin_dashboard_metrics()` and `admin_sales_analytics(days)`
  aggregate real rows only; empty stores return zeros, never sample data.

## Function surface used by the frontend

| RPC | Caller |
| --- | --- |
| `preview_coupon`, `get_my_rewards`, `get_my_referral_code`, `apply_referral_code` | customers |
| `create_order_from_cart(_contact_email, _idempotency_key, _coupon_code, _redeem_points)` | customers |
| `admin_dashboard_metrics`, `admin_sales_analytics` | admin |
| `admin_inventory_summary`, `admin_void_inventory_item` | admin |
| `admin_set_user_role` | super_admin |
| `admin_adjust_reward_points` | admin |

## Security notes

- The frontend ships only the publishable Supabase key (`VITE_SUPABASE_URL`,
  `VITE_SUPABASE_PUBLISHABLE_KEY`). The service-role key is never used in the
  client and must never be added to any `VITE_*` variable.
- Browser role checks (`RequireRole`, the admin nav) are UX only — every
  admin read/write is independently enforced by RLS policies and
  `SECURITY DEFINER` functions that re-check roles server-side.
- Digital inventory code payloads are exposed to customers only through the
  fulfillment delivery path of their own verified orders; admin list endpoints
  return metadata only.
