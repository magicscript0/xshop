# XSHOP starter catalog seed (DEMO DATA)

Date: 2026-09-25 · Branch: `arena/01a0d614-xshop` · Seed file: `supabase/seed.sql`

This seeds a realistic **demonstration** catalog so the storefront no longer
renders "0 products". Every row passes the production visibility gate
(active + public + verified + priced + categorized). The owner must replace
these starter rows with genuinely authorized supplier records over time.

## 1. Contents (exact counts, verified)

| Entity | Count | Notes |
|---|---|---|
| Categories | 6 | gift cards, vouchers, software, AI/SaaS, gaming, subscriptions |
| Products | 30 | 6 + 4 + 5 + 5 + 5 + 5 across the six categories, all USD |
| Variants (denominations) | 102 | ladder subset $40–$3000 per product where realistic |
| Prices | 102 | one per variant, at face value |
| Active deals | 8 | 7 × percent, 1 × amount; all with start/end timestamps |
| Featured products | 5 | surface first in `relevant` sort and `featured_only` |
| `digital_inventory` rows | **0** | no codes invented — see §3 |
| Orders / payments / hashes | **0** | no transactions fabricated |
| Media rows | **0** | no binaries in Git; UI renders its neutral placeholder |

Denominations used, per product, from the approved ladder:
$40, $80, $160, $200, $350, $500, $750, $1000, $1500, $2000, $2500, $3000.
The $4000–$7500 rungs were **deliberately not used**: no starter product
legitimately offers consumer denominations that high, and the seed brief
forbids forcing them. Enterprise-tier AI packs use $1500–$3000.

## 2. Fulfillment honesty model

- **88 prices: `unlimited` + `manual`.** Available immediately; after payment
  verification the order routes to `manual_required` and staff deliver
  through the existing `fulfillment_manual_complete` workflow. Metadata says
  "Email delivery / Within 6 hours of payment verification".
- **14 prices: `digital` + `inventory`, with zero stocked codes.** These
  report `is_available = false` everywhere (listing badges, detail options,
  cart add is rejected with "unavailable"). They exist so the "code pipeline"
  products are visible but honestly unbuyable until the owner imports **real**
  codes via `public.admin_import_digital_inventory`.

Intentionally unavailable (no legitimate inventory provided):

| Product | Tiers affected |
|---|---|
| Nintendo eShop Card | $40 / $80 / $160 |
| Riot Points Card | $40 / $80 / $160 |
| Blizzard Balance Card | $40 / $80 / $160 / $200 |
| DataQuery Scale Credits | enterprise $1500 / $2000 / $2500 / $3000 only (standard tiers are staff-fulfilled and available) |

No claim is made that any redeemable code exists: `digital_inventory`
contains zero rows after seeding, and the verifier asserts that.

## 3. What the seed never does

- No users, profiles, orders, payment sessions, transaction hashes, reviews,
  wishlists, reward entries, or notifications.
- No `digital_inventory` rows (no real or fake codes).
- No RLS changes: the seed only inserts data; all published rows remain
  readable by `anon` through the existing public policies, and writes stay
  admin-gated (asserted by the verifier).
- No payment-card or financial-credential content anywhere: gift-card /
  credit products are named only; no PANs, CVVs, PINs, expiries, or
  credentials are created, stored, or displayed.

## 4. Hosted apply (owner session)

Prerequisites: migrations applied through Phase 9 (see
`docs/SUPABASE_PHASE9.md` §4), plus **at least one admin profile**
(`update public.profiles set role = 'super_admin' where id = …`). The admin
is recorded as the resale-rights verifier, satisfying the
`resale_rights_verified_by` foreign key truthfully.

1. Open the Supabase SQL editor on the project.
2. Paste the entire `supabase/seed.sql` and run it once. It runs in a single
   transaction and prints a `NOTICE` with the inserted counts.
3. The script is idempotent (`ON CONFLICT DO NOTHING` / `NOT EXISTS`
   guards): re-running changes nothing and is safe.

To retire the demo catalog later, delete in dependency order
(`product_deals` → `product_media` → `product_prices` → `product_variants` →
`product_categories` → `products` → `categories`) or simply unpublish
individual products (`status = 'draft'`), which hides them instantly through
the existing visibility gate.

## 5. Local verification

`supabase/tests/verify-catalog.mjs` (`npm run verify:catalog`) applies all
migrations plus the seed to embedded Postgres and runs **74 assertions**
mirroring the exact calls the UI makes (`catalogService.search` params for
/shop, /deals, /search, category pages, sorting; `listCategories`;
`listCurrencies`; `getProductBySlug`): counts, gate compliance, deal math
(original/current/discount/expiry), filters, all four UI sorts, featured
ordering, per-tier availability honesty, cart accept/reject behavior without
creating orders, metadata completeness, and RLS intactness.

Verified status (2026-09-25): **74/74 pass** on PGlite / PostgreSQL 18.3,
`npm test` still **120/120**, and `vite build` green. Product images are not
seeded, so cards/detail render the existing neutral placeholder (verified
null-safe in `ProductCard.jsx`); no broken-image state is possible.

## 6. Known data/UI gaps for Phase B (storefront upgrade)

The seed populates everything the schema holds, but two display wirings are
still Phase B work (already in the approved plan, no action here):

1. `search_catalog` does not yet return the merchandising columns
   (`provider_name`, `featured`, `terms`, `redemption_instructions`,
   `region_restrictions`, `delivery_method`, `delivery_eta`). They are
   directly readable by `anon` from `products` (verified), so Phase B can
   either extend the RPC or read them per detail page.
2. `catalogService` does not yet send the Phase 9 discovery params
   (`provider_filter`, `denomination_*`, `worldwide_only`, `featured_only`)
   and `normalizeProduct` drops `deal_ends_at`. The RPC supports them
   (verified); the countdown/filter UI arrives with Phase B.
